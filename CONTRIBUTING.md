# Contributing to Silo

Thanks for wanting to contribute to Silo. This document explains how to work on the project.

## Getting Started

1. **Clone the repo:** `git clone https://github.com/zeropbc/silo.git`
3. **Install dependencies:** `pnpm install`
4. **Run tests:** `pnpm test`
5. **Start coding:** `pnpm dev` watches for changes

## What We Need

- **Bug fixes** — Something broken? Fix it.
- **Features** — Have an idea? Check if it's in the spec first.
- **Documentation** — Unclear docs? Make them clearer.
- **Tests** — Code without tests won't be merged.
- **Design feedback** — Silo should look intentional. If it doesn't, tell us.

## How to Contribute

### 1. Fork and Branch

```bash
git checkout -b feature/your-feature-name
```

Use descriptive branch names: `fix/input-echo`, `feat/sidebar`, `docs/config-guide`.

### 2. Make Changes

Follow the conventions documented in the codebase:
- TypeScript strict mode
- ESM imports with `.js` extensions
- Components are `.tsx`, everything else `.ts`
- Error messages prefixed with `E:`
- No hardcoded API keys

(If you're using an AI to help, it should read AGENTS.md for detailed conventions.)

### 3. Test

```bash
pnpm test
pnpm typecheck
pnpm lint
```

All three must pass. No exceptions.

### 4. Commit

Use this format:

```
[silo] short description

Longer explanation if needed. Reference issues: fixes #123
```

Examples:
```
[silo] add chat export to JSON and Markdown
[silo] fix streaming parser EOF handling
[silo] docs: update config guide with Gemini setup
```

Keep commits focused. One logical change per commit.

### 5. Push and PR

Push your branch and open a PR to `main`. In the PR description:

- **What changed?** (Be specific)
- **Why?** (What problem does this solve?)
- **Testing:** How did you verify this works?

Example:

```markdown
## What

Added sidebar navigation to browse and load previous chats.

## Why

Users couldn't see their chat history. This lets them switch between conversations.

## Testing

- Tested with 5+ old chats
- Sidebar toggles on [≡] click
- Chat loading works
- No regression in streaming
```

## PR Requirements

Before we merge:

- [ ] Tests pass (`pnpm test`)
- [ ] TypeScript passes (`pnpm typecheck`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Commits are focused and well-messaged
- [ ] No secrets, API keys, or credentials committed
- [ ] Documentation updated (if applicable)

## Code Review

We review PRs for:

1. **Correctness** — Does it actually work?
2. **Zero Labs principles** — Does it fit the philosophy?
3. **Code quality** — Is it maintainable?
4. **Testing** — Is it tested?
5. **Documentation** — Will others understand it?

Feedback is constructive. We're building something we're proud of.

## Issues

Found a bug? Have an idea? Open an issue.

**For bugs:**
- Describe what happened
- What did you expect?
- How to reproduce?
- What's your environment? (OS, Node version, etc)

**For features:**
- Explain the use case
- Is it in the spec? (Check SPEC.md)
- Would it add complexity?

## Decisions

Big changes require team discussion. This includes:
- New major features
- Architecture changes
- Dependency additions
- Breaking API changes

Open an issue first to discuss. We make decisions together.

## Questions?

Ask in the issue tracker or on Session (if you're part of Zero Labs).

## Code of Conduct

See CODE_OF_CONDUCT.md. Be respectful, constructive, and kind.

---

**Thanks for contributing to Silo.** We're building something real.
