# AGENTS.md

## Project overview

Silo is a CLI chat application built with TypeScript, Ink (React for terminals), and SQLite. It connects to multiple LLM providers and stores conversations locally. The spec lives in `SPEC.md`.

## Dev environment tips

- **Package manager:** pnpm. Never use npm or yarn.
- **Node version:** 18+ required.
- **Build:** `pnpm build` (uses esbuild).
- **Dev mode:** `pnpm dev` (watches and rebuilds).
- **Type check:** `pnpm typecheck` (runs `tsc --noEmit`).
- **Lint:** `pnpm lint` (ESLint with TypeScript rules).
- **Tests:** `pnpm test` (Vitest).

Always run `pnpm typecheck` and `pnpm lint` before committing. If either fails, fix it.

## Code conventions

- TypeScript strict mode. No `any` unless absolutely unavoidable (and even then, document why).
- Use ESM (`import`/`export`), not CommonJS.
- File extensions in imports: use `.js` extension in import paths (e.g., `import { foo } from './bar.js'`), even though the source is `.ts`. This is required for ESM with TypeScript.
- Components are `.tsx`, everything else is `.ts`.
- Follow the project structure in `SPEC.md` section 7. Don't invent new top-level directories without reason.
- Error messages shown to users must be prefixed with `E:` and be human-readable. No stack traces in the UI.
- API keys are read from environment variables (via config), never hardcoded or stored in the DB.
- Database schema changes go in `src/storage/schema.ts`.
- Config format is TOML (`~/.config/silo/config.toml`). Use `smol-toml` for parsing.

## Testing instructions

- Tests live in `tests/` mirroring the `src/` structure.
- Unit tests in `tests/unit/`, integration tests in `tests/integration/`.
- Run the full suite: `pnpm test`.
- Run a single test file: `pnpm vitest run tests/unit/path/to/file.test.ts`.
- Run tests matching a name: `pnpm vitest run -t "test name here"`.
- Fix any test or type errors before committing.
- Add or update tests for code you change.

## PR instructions

- Title format: `[silo] <description>`
- Run `pnpm lint`, `pnpm typecheck`, and `pnpm test` before committing.
- Keep commits focused. One logical change per commit.
- Don't commit secrets, API keys, or credentials. Ever.

## Branching & release workflow

Two long-lived branches:

- **`dev`** — nightly/bleeding-edge. All new work lands here first. Build from
  source (`pnpm install && pnpm dev` or `pnpm build && node dist/index.js`).
- **`main`** — stable releases. Only production-ready code, matched to a tagged
  publish (`@zeropbc/silo@<version>` on the Verdaccio registry).

**Feature development:** branch off `dev`, merge PRs back into `dev`.

**Release flow (`dev` → `main`):**
1. Complete work on `dev` and verify: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
2. Bump the version in `package.json` and `src/cli.ts` to the next release.
3. Open a PR from `dev` → `main`, title `[silo] vX.Y.Z: <description>`.
4. Run the full check suite once more on `main` before merging.
5. Merge the PR, then tag and push:
   ```bash
   git tag vX.Y.Z
   git push origin main --tags
   ```
6. The tag triggers the publish workflow; verify `@zeropbc/silo@X.Y.Z` on the registry.

`main` is protected from direct pushes — releases go through the PR. Keep each
release's commits focused and squashed into one `[silo] vX.Y.Z` commit.

## Global install gotcha (pnpm catalog pin)

`pnpm add -g @zeropbc/silo@latest` can resolve to a stale version because the
pnpm global catalog at `~/.local/share/pnpm/global/v11/pnpm-workspace.yaml`
auto-records every installed version under `minimumReleaseAgeExclude`. That pin
blocks `@latest` from moving past it, so upgrades lag behind the newest release.

To get a specific version reliably:

```bash
pnpm add -g @zeropbc/silo@<version> --registry https://silo-production-96d9.up.railway.app
```

If you want `@latest` to track the newest release again, remove any
`@zeropbc/silo@<version>` entries from that YAML's `minimumReleaseAgeExclude`
list. (Keep the obsolete `@zero-lab/silo@0.1.0` entry — harmless.)
