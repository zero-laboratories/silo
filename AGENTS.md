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
