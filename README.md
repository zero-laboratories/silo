
# Silo

> ## BETA PREP — STABILIZING
>
> Feature-complete against the roadmap through v0.6 and heading into pre-beta
> stability. Chat, search, tagging, per-chat system prompts, and message
> editing all work. Expect minor rough edges as we harden things toward v1.
> The UI now runs on OpenTUI (native terminal bindings) instead of Ink.

```
 ███████╗  ██╗ ██╗       ██████╗
 ██╔════╝ ███║ ██║      ██╔═████╗
 ███████╗ ╚██║ ██║      ██║██╔██║
 ╚════██║  ██║ ██║      ████╔╝██║
 ███████║  ██║ ███████╗ ╚██████╔╝
 ╚══════╝  ╚═╝ ╚══════╝  ╚═════╝
```

A CLI chat app for Linux. Talk to multiple AI providers from your terminal, own your data, and don't think about the interface.

## What is this?

Silo is a minimal chat client that lives in your terminal. It connects to Claude, OpenAI, Gemini, or OpenRouter — you pick whichever works for you (or switch between them). Conversations are stored locally in SQLite, config lives in TOML, and nothing leaves your machine unless you send a message.

It's built with OpenTUI (native terminal bindings with React) and TypeScript. The whole thing should feel fast and intentional, not like another Electron app pretending to be a terminal tool.

## Philosophy

- **Minimal.** Only what's necessary. No decorative UI elements, no loading spinners, no bloat.
- **Beautiful.** Every interaction should feel intentional. Smooth streaming, clear feedback.
- **Model-agnostic.** The provider is not the product. You own the config, you pick the model.  

## Install

Point your package manager at the registry (once):

```bash
echo '@zeropbc:registry=https://silo-production-96d9.up.railway.app' >> ~/.npmrc
```

Then install:

```bash
npm install -g @zeropbc/silo
# or
pnpm add -g @zeropbc/silo
```

Prefer a one-liner (no `.npmrc`):

```bash
npm install -g @zeropbc/silo --registry https://silo-production-96d9.up.railway.app
```

Verify:

```bash
silo
```

If you want to use Silo in your app via a project's `.npmrc`:
```bash
echo '@zeropbc:registry=https://silo-production-96d9.up.railway.app' >> .npmrc
```

## Registry

Installs come from our self-hosted Verdaccio registry on Railway. Publishing is automated: push a `v*` tag and CI builds, publishes, and trims old versions automatically.

Users should add this to `~/.npmrc`:

```
@zeropbc:registry=https://silo-production-96d9.up.railway.app
```

## Getting started

```bash
silo
```

On first run, Silo creates a config template at `~/.config/silo/config.toml`. Open it, add your API keys, and you're good to go.

```toml
[models.claude]
provider = "anthropic"
api_key_env = "ANTHROPIC_API_KEY"
model = "claude-5-sonnet"
```

Set the environment variable (or put it in your `.bashrc`):

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

Then run `silo` again. You should see a prompt ready for input.

## Supported providers

- OpenCode Go/Zen
- OpenAI
- OpenRouter
- Anthropic
- Google

Switch models from within the app via Settings.

## Configuration

All config lives in `~/.config/silo/config.toml`:

```toml
[general]
default_model = "claude"
theme = "dark"

[models.claude]
provider = "anthropic"
api_key_env = "ANTHROPIC_API_KEY"
model = "claude-5-sonnet"
temperature = 0.7
max_tokens = 2000
```

API keys are read from environment variables. Never put keys directly in the config file.

## Data

Everything is stored in a SQLite database at `~/.local/share/silo/silo.db`. Your chats, messages, settings — all local, all yours. Export to JSON or Markdown if you need to move data around.

## Development

```bash
git clone https://github.com/zeropbc/silo.git
cd silo
pnpm install
pnpm dev
```

Build with `pnpm build`. Tests live in `tests/`. Requires **Node.js 26.4+** (OpenTUI uses native FFI; the CLI self-bootstraps the `--experimental-ffi` flag, so no manual node flags are needed).

## License

GPLv3 or later. See [LICENSE](LICENSE) for details.
