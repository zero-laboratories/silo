# Security

## How Silo handles your data

Silo is designed to keep everything local. Here's exactly what happens with your data and when something leaves your machine.

### What stays local

Everything by default:

- **Conversations** — stored in SQLite at `~/.local/share/silo/silo.db`. Never leaves your machine.
- **Config** — lives in `~/.config/silo/config.toml`. API keys are referenced by environment variable name, never stored in the config file itself.
- **Chat history** — all messages, metadata, timestamps — local database only.
- **System prompts** — defined in config, sent to providers but not persisted beyond your local DB.

### What leaves your machine

Only when you send a message:

- Your message content is sent to the configured LLM provider's API endpoint over HTTPS.
- The system prompt (from your config) is included in that request.
- Previous conversation context is included so the model can follow along.

That's it. No telemetry. No analytics. No phone-home. No background connections.

### API key handling

```toml
# config.toml — this is safe, it's just a variable name
[models.claude]
api_key_env = "ANTHROPIC_API_KEY"
```

```bash
# The actual key lives in your shell environment
export ANTHROPIC_API_KEY="sk-ant-..."
```

Keys are read from environment variables at runtime. They are never written to disk by Silo, never logged, and never sent anywhere except the provider's API endpoint as part of the authentication header.

### No third-party services

Silo has no accounts, no cloud sync, no analytics endpoints, no CDN calls. The only network activity is direct API calls to the LLM providers you configure.

### Database

SQLite is a single file (`~/.local/share/silo/silo.db`). You can back it up, copy it, or delete it however you want. No WAL-mode shenanigans phoning home. No extension loading.

### If you find a vulnerability

Open an issue on the GitHub repo. Don't post details publicly. We'll respond and patch it.
