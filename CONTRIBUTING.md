# Contributing

Thanks for helping out. This repo is small on purpose — keep it that way.

## Dev setup

Requires Node.js 22+ and pnpm 10+.

```bash
git clone git@JoJoJotarou.github.com:JoJoJotarou/test-github-project-infra.git
cd test-github-project-infra
pnpm install
lefthook install     # enables the pre-commit and commit-msg hooks
pnpm dev             # http://localhost:3000
```

## Running the checks

```bash
pnpm biome check .   # lint + format
pnpm tsc --noEmit    # typecheck
pnpm test            # unit + integration
```

The pre-commit hook runs Biome on staged files, so `pnpm biome check .` is a
safety net rather than the first thing that catches a formatting slip.

## Pull requests

- Branch off `master`, one concern per branch, branch name `<type>/<description>`.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`,
  `chore`, `revert`). The `commit-msg` hook and the `commitlint` / `title-lint`
  CI jobs enforce it.
- PR titles follow the same rules — merges are squash-only, so the title
  becomes the commit message on `master`.
- Fill in the PR template: what & why, test plan, risk.
- `gate`, `commitlint`, and `title-lint` must be green before merge.

## Reporting bugs

Use the bug report issue form. "It crashes" without reproduction steps gets
closed. Security bugs go to [SECURITY.md](SECURITY.md), never to a public issue.
