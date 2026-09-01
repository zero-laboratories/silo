
# Silo

> ## ALPHA — ROUGH AROUND THE EDGES
>
> This is an early, in-progress build. Chat works, but expect rough
> edges, missing features, and breaking changes. Nothing is stable yet.

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

It's built with Ink (React for terminals) and TypeScript. The whole thing should feel fast and intentional, not like another Electron app pretending to be a terminal tool.

## Philosophy

- **Minimal.** Only what's necessary. No decorative UI elements, no loading spinners, no bloat.
- **Beautiful.** Every interaction should feel intentional. Smooth streaming, clear feedback.
- **Model-agnostic.** The provider is not the product. You own the config, you pick the model.
- **Linux-native.** Uses XDG paths, follows Linux conventions. Not a port — built for this.
- **Your data.** Everything stays local. No cloud sync, no telemetry, no accounts.

## Install

```bash
npm install -g @zero-lab/silo --registry https://silo-production-96d9.up.railway.app
# or
pnpm add -g @zero-lab/silo --registry https://silo-production-96d9.up.railway.app
```

If you want to use Silo in your app via a project's `.npmrc`:
```bash
echo '@zero-lab:registry=https://silo-production-96d9.up.railway.app' >> .npmrc
```

## Registry

Users should add this to `~/.npmrc`:

```
@zero-lab:registry=https://silo-production-96d9.up.railway.app
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

| Provider | Models | Notes |
|----------|--------|-------|
| Anthropic | Claude 5 Sonnet | Primary focus, full support |
| OpenAI | GPT-4, GPT-3.5 | Standard support |
| Google | Gemini 3.5 Flash | Basic support |
| OpenRouter | Anything on the platform | Meta-provider, route to whatever |

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
git clone https://github.com/zero-labs/silo.git
cd silo
pnpm install
pnpm dev
```

Build with `pnpm build`. Tests live in `tests/`.

## License

GPLv3 or later. See [LICENSE](LICENSE) for details.
