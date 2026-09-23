# test-github-project-infra

A small todo web app: a JSON API backed by a file store, plus a vanilla JS
frontend. It is also the proving ground for this repository's CI, release, and
hygiene automation.

![CI](https://github.com/JoJoJotarou/test-github-project-infra/actions/workflows/ci.yml/badge.svg)
![Release](https://github.com/JoJoJotarou/test-github-project-infra/actions/workflows/release.yml/badge.svg)
![License](https://img.shields.io/github/license/JoJoJotarou/test-github-project-infra)

## Quick start

Requires Node.js 22+ and pnpm 10+.

```bash
pnpm install
pnpm dev          # build + start on http://localhost:3000
```

Then open http://localhost:3000 and add a todo.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP listen port |
| `HOST` | `0.0.0.0` | HTTP bind address |
| `DATA_FILE` | `data/todos.json` | Where todos are persisted |

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Build once, then run with watch |
| `pnpm build` | Type-check and emit `dist/` |
| `pnpm test` | Unit + integration tests (vitest) |
| `pnpm biome check .` | Lint and format check |
| `pnpm tsc --noEmit` | Type check |

## Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md) — dev setup, test command, PR flow
- [SECURITY.md](SECURITY.md) — how to report a vulnerability

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
