# AGENTS.md

## Project overview

Silo is a CLI chat application built with TypeScript, Ink (React for terminals), and SQLite. It connects to multiple LLM providers and stores conversations locally. The spec lives in `SPEC.md`.

## Dev environment tips

- **Package manager:** pnpm. Never use npm or yarn.
- **Node version:** 26.4+ required (OpenTUI needs `--experimental-ffi`; the CLI self-bootstraps the flag).
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

### OpenTUI UI conventions (replaces Ink)

- The UI uses **OpenTUI** (`@opentui/core` + `@opentui/react`), not Ink. `tsconfig.json` and esbuild use `jsxImportSource: "@opentui/react"`.
- JSX uses **kebab-case intrinsic elements**: `<box>`, `<text>`, `<span>`, `<code>`, `<markdown>`, `<input>`, `<scrollbox>`. Do NOT import `Box`/`Text` from anything.
- `<text>` colors use **`fg`/`bg`** (NOT Ink's `color`). Bold/dim/inverse use **`attributes`** (an int bitmask) via `createTextAttributes({ bold, dim, inverse })` from `@opentui/core`; semantic constants live in `src/ui/styles.ts` (`BOLD`, `DIM`, `INVERSE`, `BOLD_INVERSE`).
- **Nested `<text>` inside `<text>` is an error** ("TextNodeRenderable only accepts strings…"). Use `<span>` for inline styled runs inside a `<text>`.
- Input is **`useKeyboard((e) => {})`** (replaces Ink `useInput`). `e` is a `ParsedKey`: use `e.name === 'return' | 'escape' | 'up' | 'down'`, `e.name === 'backspace' || 'delete'`, `e.ctrl`, and `inputCharOf(e)` (`e.name.length === 1 ? e.sequence : ''`) for typed characters.
- The entry (`src/cli.ts`) uses async `createCliRenderer()` + `createRoot(renderer).render(...)`; clean up via `renderer.destroy()`. Quit key is **Ctrl+X** (`onRequestClose` prop).
- Tests render components headlessly with `@opentui/react/test-utils`'s `testRender` + `waitForFrame`; vitest must run with `NODE_OPTIONS=--experimental-ffi` (the `test` script does this).

## Testing instructions

- Tests live in `tests/` mirroring the `src/` structure.
- Unit tests in `tests/unit/`, integration tests in `tests/integration/`.
- Run the full suite: `pnpm test` (sets `NODE_OPTIONS=--experimental-ffi`).
- Run a single test file: `pnpm vitest run tests/unit/path/to/file.test.ts` (prepend `NODE_OPTIONS=--experimental-ffi` if it exercises OpenTUI).
- Run tests matching a name: `pnpm vitest run -t "test name here"`.
- Fix any test or type errors before committing.
- Add or update tests for code you change.

## PR instructions

- Title format: `[silo] <description>`
- Run `pnpm lint`, `pnpm typecheck`, and `pnpm test` before committing.
- Keep commits focused. One logical change per commit.
- Don't commit secrets, API keys, or credentials. Ever.

## Bug workflow (issues → PR)

When a bug is found, track it with an issue **before** fixing it:

1. **File the issue** with `gh`:
   ```bash
   gh issue create --label bug --title "[bug] <short description>" --body "…
   ```

2. **Reference the issue** in the fix. Create a branch off `dev`, then when
   committing the fix and opening the PR, link them with a keyword:
   ```bash
   git checkout dev && git checkout -b fix/<short-name>
   # commit the fix; reference the issue in the PR body or commit:
   #   Fixes #<issue-num>
   git push origin fix/<short-name>
   gh pr create --base dev --head fix/<short-name> --title "fix: <description>" --body "Fixes #<issue-num>"
   ```
   A `Fixes #n` / `Closes #n` reference automatically closes the issue when the
   PR merges into `dev`.

3. **Review + merge** the PR into `dev` (CI `checks` must pass). `Fixes #n` only
   auto-closes the issue when the PR merges into the **default branch** (`main`),
   so after merging a fix into `dev`, close the linked issue manually:
   ```bash
   gh issue close <issue-num> --comment "Fixed in dev via PR #<pr>; ships in next release."
   ```

Rule: **bug found → issue first, fix PR second, merge third.** Never jump
straight to a fix PR without an issue for a bug.

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

**Branch alignment rule:**

- Between releases, `dev` stays **4-10 commits ahead** of `main` (nightly work
  accumulates there).
- **On every release** (`dev` → `main` via PR + squash), the two branches must
  **converge to equal**: after merging and tagging, reset `dev` to `main`'s tip
  and re-apply any genuinely-new dev commits that weren't part of this release.

Resyncing dev to main (do this whenever they diverge in content):
```bash
git checkout dev
git fetch origin
git reset --hard origin/main      # align dev to main's history
# re-apply any NOT-yet-released dev-only commits (cherry-pick), then:
git push --force-with-lease origin dev
```
Because releases squash PRs into one commit, never `git merge main` into dev
after a squash — it produces duplicate-content conflicts (same change as a raw
commit and inside the squash). Reset + cherry-pick avoids that.

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
