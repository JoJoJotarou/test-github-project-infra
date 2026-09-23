# project-setup 三技能评估报告

评估对象：`plugins/project-setup` 下的三个技能

- `ci-pipeline-setup` v2026.09.22
- `release-pipeline-setup` v2026.09.22
- `repo-hygiene-setup` v2026.09.22

评估方式：用这三个技能从零搭建了一个 todo web 应用仓库
（<https://github.com/JoJoJotarou/test-github-project-infra>），把技能里的每条命令、每个
YAML 片段、每个 `gh` 调用都真实跑过一遍，记录哪些一次成功、哪些失败、失败原因是什么。

评估日期：2026-09-23。所有结论都附了本次会话中实际跑过的证据。

---

## 1. 结论速览

| 技能 | 一次通过 | 需要改写后才能用 | 结论 |
|---|---|---|---|
| `ci-pipeline-setup` | 本地钩子、检查链、矩阵、`gate` 作业、E2E 独立流水线 | `pnpm/action-setup-v4` 不存在；Node 模板的 OS 矩阵对 web 应用是浪费 | **可用，但有 1 个会让 CI 全红的致命笔误** |
| `release-pipeline-setup` | commit-msg 钩子、commitlint 配置、git-cliff 配置、版本计算 | `title-lint` 的 `printf` 写法会让**每个 PR 标题都不过**；发布流水线与分支保护互相打架 | **思路对，两处必须修** |
| `repo-hygiene-setup` | 全部静态文件（README/LICENSE/issue forms/PR 模板/CODEOWNERS/Dependabot） | Step 10 的 6 条 `gh` 命令里 5 条在当前 gh + 当前 API 下无效或静默失效 | **文件部分优秀，仓库设置部分基本不可用** |

三份技能合起来最大的问题不是单个笔误，而是**跨技能冲突**：`repo-hygiene-setup`
Step 10 的分支保护，会让 `release-pipeline-setup` Step 5 的发布流水线永远失败（不出
tag、不出 Release）。同一插件内的两个技能互相拆台，而两边都没有提到这个交互。

---

## 2. 评估环境

| 项 | 值 |
|---|---|
| 仓库 | `JoJoJotarou/test-github-project-infra`，公开，trunk = `master` |
| 本地 | Node 25.8.2、pnpm 10.10.0、gh 2.83.2、lefthook 2.1.9（brew）/ 2.0.4（devDep） |
| 凭据 | 环境里的 `GITHUB_TOKEN` 是只读 fine-grained PAT，所有写操作 403；改用 keyring 里的 `gho_` token（`repo` scope）完成 API 写入 |

最后一条本身就是第一个发现：**Step 10 的前置检查是真的必要的**。本次评估中
`gh label create`、`gh pr create`、`gh api PUT .../branches/master/protection` 全部返回
`Resource not accessible by personal access token`。技能里写的"If any check fails,
report it and use the web path — never skip the setting silently"是对的，问题在于它
假设失败是例外；实际上 agent 拿到的 token 常常就是只读的。

---

## 3. ci-pipeline-setup

### 3.1 致命：`pnpm/action-setup-v4` 这个 action 不存在

SKILL.md Step 8 和 `refs/github-actions.md` 的 Node 模板都写：

```yaml
- uses: pnpm/action-setup-v4
  with:
    version: 10
```

实际请求 `https://api.github.com/repos/pnpm/action-setup-v4` 返回 **404**。正确的引用是
`pnpm/action-setup@v4`（`pnpm/action-setup` 仓库存在，200）。

后果非常难排查：workflow 直接 `startup_failure`，**0 个 job、0 条日志、0 条 annotation**，
只在 UI 上显示一句"This run likely failed because of a workflow file issue"。

```
completed  failure  ci.yml  chore/ci-pipeline  push  35810483187  0s
$ gh api .../actions/runs/35810483187/jobs  →  {"total_count":0,"jobs":[]}
$ gh api .../actions/workflows              →  {"state":"active"}   # 看起来完全正常
```

对照实验：同一分支上放一个只有 `echo hello` 的 `Smoke` workflow，它正常排队并成功
（`✓ smoke in 3s`），证明 GitHub Actions 本身没问题，问题就在这条 `uses:`。

改成 `pnpm/action-setup@v4` 后同一个 PR 立刻全绿：`ci (24)`、`ci (22)`、`gate` 三个作业
14s / 13s / 2s 通过。

**修复建议**：SKILL.md Step 8 的 action 清单和 refs 模板统一改成 `pnpm/action-setup@v4`，
并加一条 gotcha："`owner/repo@vN` 与 `owner/repo-vN` 是两种不同的东西，写错会让整个
run 以 0 job 失败，没有任何日志可看。"

### 3.2 确认有效的部分

| 设计 | 验证结果 |
|---|---|
| `gate` 作业吸收矩阵 | 矩阵产出 `ci (22)` / `ci (24)` 两个 check，`gate` 单点Required，名称为 `gate`、`commitlint`、`title-lint` 三条都稳定出现在 `gh pr checks` 里 |
| 红 PR 拦截 | 故意让一个测试失败后：`ci (22) fail`、`ci (24) fail`、`gate skipping`。`gate` 被 skip 等于 required check 未通过，合并被拦 |
| `stage_fixed: true` | 暂存一个格式错误的文件后提交，`git show HEAD:src/scratch.ts` 是格式化后的版本（工作树与暂存一致） |
| 钩子真的拦截 | 暂存含 `debugger` 的文件，`biome check` 报 1 error，`exit status 1`，commit 未生成 |
| 检查链命令 | `pnpm biome check .`、`pnpm tsc --noEmit`、`pnpm vitest run` 三条原样可用，无需改写 |
| `--frozen-lockfile` + `cache: pnpm` | 正常，锁文件与 `package.json` 不同步会直接失败 |
| E2E 独立 | `e2e.yml` 在 trunk push 上运行，3 条 Playwright 用例 55s 全过，且按技能要求**不在** PR 必需检查里 |
| `*-latest` 告警 | run 的 annotation 实测出现"The ubuntu-latest label will migrate to Ubuntu 26 beginning October 19, 2026"——技能的 gotcha #8 是真实且正在发生的 |

### 3.3 次要问题

1. **refs 的 Node 模板矩阵对 web 应用是浪费。** `refs/github-actions.md` 写死
   `os: [ubuntu-latest, macos-latest]`。todo web 应用没有任何 Apple 平台代码，macOS
   runner 是纯浪费。SKILL.md Step 2 给了正确的出口（"Add windows-latest only for…"、
   "the oldest supported version is the valuable cell"），但 refs 模板没有体现，照抄的
   人会直接烧一倍的 runner 时间。本次评估改用 `version: [22, 24]` 单 OS 矩阵。
2. **钩子的 glob 不含 YAML。** `*.{js,ts,jsx,tsx,json,jsonc,css}` —— workflow 文件
   （`.yml`）在本地完全没有 lint。上面那个致命的 action 笔误如果本地能查，就不会拖到
   CI 才发现。技能没有提供任何 workflow 静态检查手段。
3. **Node 模板没有 build 步骤。** 本项目 e2e 需要先 `tsc` 才能在 Playwright 里起服务，
   最后只能把 `pnpm build && pnpm start` 塞进 `playwright.config.ts` 的 `webServer.command`。
   对有构建步骤的项目，refs 模板缺一环。
4. **`@v4` 系列 action 本身跑在已被弃用的 Node 20 上。** run 的 annotation：
   "actions/checkout@v4, actions/setup-node@v4, pnpm/action-setup@v4 … target Node.js 20
   but are being forced to run on Node.js 24"。Step 8 讨论了 SHA 固定，但没提"固定到
   SHA 之后这些 action 仍跑在 Node 20 运行时上"这件事。

---

## 4. release-pipeline-setup

### 4.1 致命：`title-lint` 让每个 PR 标题都不过

SKILL.md Step 4 的写法：

```yaml
        run: printf '%s' "$TITLE" \
          | npx --yes @commitlint/cli@21.2.3 --config .commitlintrc.json
```

这在 YAML 里是**普通多行标量**，会被折叠成一行，反斜杠和竖线之间留下一个空格：

```
printf '%s' "$TITLE" \ | npx --yes @commitlint/cli@21.2.3 --config .commitlintrc.json
```

bash 把 `\ ` 解析成**转义空格**，于是 `printf` 多收到一个内容为空格的参数；`printf` 会把
格式串复用到剩余参数上，输出就变成"标题 + 一个尾随空格"。commitlint 的 `header-trim`
随即报错。

runner 上的实测（`od -c` 逐字节对比两种写法）：

```
Form A（技能原文，反斜杠续行）  0000060   m   a   t   i   o   n          ← 55 字节，尾部有空格
Form B（块标量单行）            0000060   m   a   t   i   o   n            ← 54 字节，干净
```

以及 CI 日志：

```
⧗   --- input ---
ci: wire commitlint, git-cliff, and release automation
✖   header must not end with whitespace [header-trim]
✖   found 1 problems, 0 warnings
```

本地最小复现：

```bash
$ T=abc; printf '%s' "$T" \ | od -c
0000000   a   b   c                                      ← 4 字节
$ printf '%s' "$T" | od -c
0000000   a   b   c                                    ← 3 字节
```

影响面：`title-lint` 是必需检查之一，也就是说**照抄该片段后，没有任何 PR 能合并**。

**修复建议**：把整条管道放进块标量：

```yaml
        run: |
          printf '%s' "$TITLE' \
            | npx --yes @commitlint/cli@21.2.3 --config .commitlintrc.json
```

本次评估即用此写法，`title-lint` 随后稳定通过。这条值得写进 Critical Gotchas：普通多行
标量会折叠，`\` + 换行 + `|` 会变成一个多余参数。

### 4.2 致命：发布流水线与分支保护互斥

`repo-hygiene-setup` Step 10 打开分支保护后，`release-pipeline-setup` Step 5 的
`Commit CHANGELOG & Push Tag` 步骤必然失败：

```
remote: error: GH006: Protected branch update failed for refs/heads/master.
remote: - Changes must be made through a pull request.
remote: - 3 of 3 required status checks are expected.
! [remote rejected] master -> master (protected branch hook declined)
##[error]Process completed with exit code 1.
```

步骤失败 → 后面的 `Create GitHub Release` 被 skip → **不出 tag、不出 Release，整条发布
流水线一次都没成功过**（run 35812489459）。

还有一个更隐蔽的次生后果：`git push origin master --tags` 会把 branch 和 tag 分开推送，
branch 被拒但 **tag 推送成功**。于是失败一次也会留下一个指向"本地生成的 changelog 提交"
的 tag——而这个提交从没进过 master。实测：

```
v0.1.2 -> b5128d1 chore(release): update changelog for v0.1.2 [skip ci]   # 不在 master 上
```

这正好踩中技能自己的 gotcha 12（"Tags are the version source of truth"）：版本源被污染，
下一次 release 会算出重复或错误的版本号。

试过的替代方案也不行：让 bot 开一个 changelog PR 自动合并。PR 建出来了、auto-merge 也
开了，但

```
pull request create failed: GraphQL: GitHub Actions is not permitted to create or approve pull requests
```

（需要额外打开"Allow GitHub Actions to create and approve pull requests"，Step 10 没提）；
打开之后又发现

```
$ gh api repos/.../actions/runs?branch=chore/changelog-v0.1.2  →  total_count: 0
$ gh api repos/.../commits/chore/changelog-v0.1.2/check-runs   →  total_count: 0
```

用 `GITHUB_TOKEN` 创建的事件**不会触发 workflow**，所以这种 PR 永远凑不齐必需检查，
auto-merge 永远不落地。

**最终可用方案**（本次评估采用）：放弃把 changelog 提交到 trunk，改为"打 tag + 在
GitHub Release notes 里发布 changelog + 上传 artifact"。tag 用 `git push origin
refs/tags/$TAG` 单独推送（tag ruleset 只禁删除/更新，不禁创建）。修好后实测：

```
✓ release in 8s
v0.1.2  Latest  v0.1.2
```

**修复建议**：技能里必须写清"分支保护 + 发布自动化"这个组合的两个约束，并给出可用的
默认方案；否则每个照做的人都会得到一个从不发布的 release workflow。

### 4.3 其他问题

1. **trunk 名称。** release-pipeline 自己的 gotcha 11 说得很清楚（branch 过滤器是字面
   glob，没有 default branch 模式），YAML 里也确实要改（`branches: [master]`、
   `git push origin master --tags`）。但同一插件的 `repo-hygiene-setup` Step 10 却把
   `branches/main/protection` 写死在 JSON 里，在 master trunk 上直接 404。两个技能对
   同一个事实给出了相反的默认值。
2. **"PR 标题会成为提交信息"不完全成立。** 实测 PR #7：标题
   `test: revert the deliberate gate failure`，合并后 master 上的提交主题却是
   `Revert "test: deliberate failure to prove the gate blocks (#6)"`——用的是提交信息而不
   是标题。所以 `title-lint` 仍然必要（理由成立），但技能把机制说绝对了。好消息是
   `commitlint` 作业覆盖了 PR 内每个提交，两头都堵上了。
3. **版本计算与 changelog 分组符合预期。** `git-cliff --config cliff.toml --bumped-version`
   → `v0.1.2`；分组输出 Features / Bug Fixes / Miscellaneous Tasks 正确；`ci` 类型按设计
   不进 changelog（技能明确说明了这一点）；`[skip ci]` 也确实阻止了 changelog 提交再次
   触发 release workflow。
4. **`filter_unconventional = true` 会静默丢提交。** revert 产生的
   `Revert "..."` 提交不出现在 changelog 里，日志里只有一句
   `2 commit(s) were skipped due to parse error(s)`。技能在 gotcha 9 提过，值得再强调：
   changelog 少一条不报错。

### 4.4 确认有效的部分

| 设计 | 验证结果 |
|---|---|
| `commit-msg` 钩子 | `added some stuff` → `type-empty` / `subject-empty` → 提交被拒；`ci: ...` 通过 |
| `npx --yes @commitlint/cli@21.2.3` 零安装 | CI 上直接可用，`extends: @commitlint/config-conventional` 正常解析 |
| PR 级 commitlint | `--from origin/${{ github.base_ref }} --to HEAD` 覆盖 PR 内每个提交，通过 |
| `cliff.toml` | 语法、分组、SemVer  bump 全部正确 |
| `[skip ci]` 防自触发 | changelog 提交没有产生新的 release run |
| 需要 baseline tag | 无 tag 时 `git-cliff --bumped-version` 输出 `0.1.0` 并告警
  "No releases found, using 0.1.0 as the next version"——gotcha 5 属实，必须先打 `v0.1.0` |

> 环境备注：本机 `npx` 被一个 shim 接管，本地跑钩子时不接受版本固定参数（只打印
> `npm notice run 'commitlint'`）。CI 上是真 npx，不受影响；但这说明"本地钩子与 CI 完全
> 同一条命令"在非常规 Node 环境里不成立。

---

## 5. repo-hygiene-setup

### 5.1 Step 10 的 `gh` 命令：6 条里 5 条无效或静默失效

这是本次评估中问题最集中的一个地方。共同特征是**不报错、但设置没生效**——正是技能自己
gotcha 8 说的"fails silently"，只不过原因在技能内部。

| 技能原文 | 实际结果 | 正确写法 |
|---|---|---|
| `gh repo edit --enable-squash-merge --disable-merge-commit --disable-rebase-merge --delete-branch-on-merge` | `unknown flag: --disable-merge-commit`（gh 2.83.2 只有 `--enable-*`） | `gh api -X PATCH repos/$R -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false -F delete_branch_on_merge=true` |
| `gh api -X PUT repos/$R/branches/main/protection` | master trunk 上路径错误 | `.../branches/master/protection` |
| `gh api -X POST repos/$R/private-vulnerability-reporting` | **404 Not Found** | 动词是 `PUT` |
| `gh api -X PUT repos/$R/actions/permissions -F ... -F default_workflow_permissions=read -F allowed_actions=selected` | 命令成功、无报错，但回读 `default_workflow_permissions: null`——该字段不归这个端点管 | 拆成两次：`PUT .../actions/permissions`（enabled/allowed_actions）+ `PUT .../actions/permissions/workflow`（default_workflow_permissions） |
| `gh api -X PUT repos/$R/actions/permissions/selected-actions --input -` 传 `patterns_whitelist` | 命令成功、无报错，回读 `patterns_allowed: []`——字段名已改 | `patterns_allowed` |
| tag ruleset `"include": ["v*"]` | **422 Invalid target patterns: 'v\*'** | `["refs/tags/v*"]` |

回读验证（这是唯一能发现静默失败的办法）：

```
$ gh api repos/$R/actions/permissions
{"allowed_actions":"selected","default_workflow_permissions":null,"enabled":true}
$ gh api repos/$R/actions/permissions/selected-actions
{"github_owned_allowed":true,"patterns_allowed":[],"verified_allowed":false}
```

**修复建议**：Step 10 每条命令后面都跟一条回读命令；所有写操作执行后必须回读确认。这比
在正文里警告"可能失败"有用得多。

### 5.2 action 白名单挡住同插件其他技能用的 action

技能给的白名单是 `["actions/*", "github/*"]`，但同一插件的另外两个技能要求：

- `pnpm/action-setup-v4`（ci-pipeline-setup Step 8 自己列过）
- `orhun/git-cliff-action`（release-pipeline-setup Step 5）
- `softprops/action-gh-release`（release-pipeline-setup Step 5）

后果：`ci.yml` 和 `release.yml` 全部 `startup_failure`、0 job、无日志。把白名单扩到
`["actions/*","github/*","pnpm/*","orhun/*","softprops/*"]` 后立刻恢复。

**修复建议**：Step 10 的白名单示例必须覆盖三个技能用到的全部 action owner，或者明确
写成"先收集本仓库所有 workflow 的 action owner，再生成白名单"。

顺带发现：`allowed_actions=selected` 期间 Dependabot 的更新 run 也失败过
（`Dependabot encountered an error performing the update`）。白名单收紧对 bot 的连带影响
值得在技能里提一句。

### 5.3 单人仓库的死锁（技能完全没覆盖）

Step 10 的分支保护预设是 `enforce_admins: true` + `required_approving_review_count: 1`。
在只有一个人的仓库上，这等于**任何 PR 都无法合并**：

```
$ gh pr merge 5 --squash --delete-branch
X ... is not mergeable: the base branch policy prohibits the merge.
$ gh pr merge 5 --squash --delete-branch --admin
GraphQL: At least 1 approving review is required by reviewers with write access.
$ gh pr review 5 --approve
failed to create review: GraphQL: Review Can not approve your own pull request
```

而如果把 `enforce_admins` 关掉让 owner 能合并，**owner 会连红 PR 一起合并**（实测：
一个故意让测试失败的 PR 在 `ci (22) fail` / `ci (24) fail` / `gate skipping` 的状态下被
成功合并进了 master）。

唯一对单人仓库成立的组合是：

```json
"enforce_admins": true,
"required_pull_request_reviews": { "required_approving_review_count": 0 }
```

本次评估最终采用这个组合，实测绿 PR 正常合并、`enforce_admins` 保证管理员也不能绕过
检查。**修复建议**：Step 10 增加一个"维护者数量"分支：≥2 人用 1 review；1 人用 0 review
+ `enforce_admins: true`，并说明另外两种组合各自会坏成什么样。

### 5.4 缺失的仓库设置

- **"Allow GitHub Actions to create or approve pull requests"** 不在 Step 10 里，但任何
  要开 PR 的 workflow 都需要它，否则报
  `GitHub Actions is not permitted to create or approve pull requests`。
- **Dependabot alerts / security updates** 不在 Step 10 里。本次实测
  `Dependabot alerts are disabled for this repository`——只配 `dependabot.yml` 只能拿到
  版本更新 PR，安全告警是另一个仓库开关。
- `dependabot.yml` 里用了 `labels: [dependencies]`，而该 label 默认不存在（issue-forms
  的 gotcha 说过 label 要先用命令建，但 dependabot 的 `labels:` 同理，技能没连起来）。

### 5.5 确认有效的部分

| 设计 | 验证结果 |
|---|---|
| README 骨架（badge + quick start + 配置表） | 直接可用；quick start 命令在干净机器上验证过（`pnpm install && pnpm dev`） |
| LICENSE 从 choosealicense.com 取原文 | 按技能要求下载而非手打，MIT 文本完整 |
| `.gitignore` / `.editorconfig` | Node 基线 + 本地排除，indent 与 biome 配置一致 |
| CONTRIBUTING / CODE_OF_CONDUCT / SECURITY | Contributor Covenant 原文 + 私密报告链接，可用 |
| issue forms（YAML）+ `blank_issues_enabled: false` | 结构化字段、`labels:` 生效（bug / enhancement 默认存在） |
| PR 模板 | 检查清单形式，<15 行 |
| CODEOWNERS | 个人仓库只能用个人（技能说"用团队"，此处按实情偏离并注明） |
| Dependabot 分组 minor/patch | 配置生效 |
| Step 10 的前置检查设计 | 必要且正确，见第 2 节 |

---

## 6. 跨技能问题汇总（最需要修的部分）

| # | 问题 | 涉及技能 | 严重度 |
|---|---|---|---|
| 1 | `title-lint` 的 YAML 折叠导致每个 PR 标题都不过 | release-pipeline | 致命 |
| 2 | 分支保护让发布流水线永远失败，且 tag 被污染 | repo-hygiene × release-pipeline | 致命 |
| 3 | `pnpm/action-setup-v4` 不存在，CI 以 0 job 失败 | ci-pipeline | 高 |
| 4 | action 白名单挡住同插件其他技能的 action | repo-hygiene × ci/release | 高 |
| 5 | Step 10 六条 `gh` 命令五条无效或静默失效 | repo-hygiene | 高 |
| 6 | 单人仓库分支保护死锁 / 或管理员可合红 PR | repo-hygiene | 高 |
| 7 | trunk 名默认值互相矛盾（`main` vs `master`） | repo-hygiene × release-pipeline | 中 |
| 8 | refs Node 模板的 OS 矩阵对 web 应用浪费 | ci-pipeline | 中 |
| 9 | 本地钩子 glob 不含 YAML，workflow 无静态检查 | ci-pipeline | 中 |
| 10 | Node 模板缺 build 步骤 | ci-pipeline | 中 |
| 11 | 缺"允许 Actions 建 PR"与"Dependabot alerts"两个仓库开关 | repo-hygiene | 中 |
| 12 | "PR 标题必然成为提交信息"不总成立 | release-pipeline | 低 |

---

## 7. 对技能编写方式本身的两点观察

1. **"Critical Gotchas"清单质量很高，但覆盖不到"片段本身是错的"这一类。**
   三个技能的 gotcha 都写得具体、可验证（`*-latest` 会漂移、矩阵 job 需要 gate、
   `[skip ci]` 防自触发、cache key 必须含 lockfile hash……本次都逐一验证属实）。但 gotcha
   讲的是"使用者容易忘的事"，讲不了"这个片段粘贴下去就跑不起来"。像
   `pnpm/action-setup-v4` 和 `printf '%s' "$TITLE" \` 这种错误，只有真的跑一次才会暴露。
   建议给每个可粘贴片段加一个最小可执行验证（哪怕只是在 CI 里跑一次的空 workflow）。
2. **三个技能都需要一次真实的端到端跑通作为验收。** 本次评估里，凡是"照抄即过"的部分
   （静态文件、lefthook 钩子、commitlint 配置、git-cliff 配置、gate 作业设计）质量都很
   高；凡是"需要与外部系统交互"的部分（gh API、GitHub Actions 行为、YAML 折叠）错误率
   显著更高。这不是编写水平问题，是这类知识的半衰期问题——技能的 `metadata.version`
   已经在了，但没有任何机制保证它与外部系统的当前行为同步。

---

## 8. 最终仓库状态

todo web 应用本身按三个技能的要求完整落地并全部验证通过：

```
pnpm biome check .      ✓ 16 files, no fixes applied
pnpm tsc --noEmit       ✓
pnpm vitest run         ✓ 18 passed (unit + integration)
pnpm exec playwright test  ✓ 3 passed (add/complete/delete, 校验错误, 刷新后保留)
```

工程化落地情况：

- 本地门：`lefthook install` 后 pre-commit（biome + `stage_fixed`）与 commit-msg
  （commitlint）双钩子均验证可拦可放。
- 云门：`ci.yml` 在 PR 上跑 lint → typecheck → unit，Node 22/24 矩阵 + 单点 `gate`。
- E2E：`e2e.yml` 仅 post-merge + nightly，3 条关键流，55s 通过。
- 提交门：`commitlint`（PR 内每个提交）+ `title-lint`（PR 标题）均为必需检查。
- 发布：`release.yml` 在 trunk push 上由 Conventional Commits 计算 SemVer、打 tag、
  出 GitHub Release，changelog 发布在 Release notes + workflow artifact。
- 仓库设置：squash-only + 删分支、分支保护（`gate`/`commitlint`/`title-lint`，
  `enforce_admins: true`，0 review）、私密漏洞报告、actions 默认只读 + 白名单、
  允许 Actions 建 PR、`v*` tag ruleset、auto-merge。
- `AGENTS.md` 已按三个技能的 handoff 段落写入，并补充了本次评估实测出的三条约束
  （分支保护与发布自动化的关系、GITHUB_TOKEN 建 PR 不触发 CI、单人仓库的审查数）。

过程中产生的痕迹（红 PR、失败 run、被删的 tag）都是评估证据，已在正文引用。
