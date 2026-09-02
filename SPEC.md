# Silo Architecture Specification

**Project:** Silo (S1L0)  
**Organization:** Zero PBC  
**Status:** MVP Specification  
**Distribution:** pnpm package (npm registry)

---

## 1. Overview

Silo is a minimal, model-agnostic CLI chat application for Linux. It prioritizes elegant user experience (60%) while delivering core features (40%). Users can chat with multiple AI providers, manage conversations locally, and own their data.

**Philosophy:**
- Minimal by design (only what's necessary)
- Beautiful interaction (every action should feel intentional)
- Model-agnostic (provider is not the product, the harness is)
- Linux-native (designed for Linux, not ported)
- User ownership (data lives locally, encrypted or not by user choice)
- Open source from day one (GPLv3-or-later)

---

## 2. Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Language | TypeScript | Type-safe, contributor-friendly, modern tooling |
| TUI Framework | Ink + React | React for terminals, composable components, elegant |
| CLI Framework | commander.js | Battle-tested, minimal, familiar to Node devs |
| Storage | SQLite (better-sqlite3) | Queryable, ACID compliance, single-file portability |
| Config Format | TOML (smol-toml) | Human-readable, structured, no extra dependencies |
| HTTP Client | node-fetch | Lightweight, no supply chain issues, spec-compliant |
| Runtime | Node.js 18+ | LTS, widely available, built-in permissions model |
| Build Tool | esbuild | Fast, minimal config, easy tree-shaking |
| Package Manager | pnpm | Fast, efficient, lock file by default |

---

## 3. Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                    Silo CLI App                          │
│              (pnpm package, Node.js runtime)             │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌────────────────────────────────────────────────────┐ │
│  │          TUI Layer (Ink + React)                   │ │
│  │  • Component tree (Chat, Sidebar, Input, etc)      │ │
│  │  • Key bindings (Ctrl+C, Ctrl+D, etc)              │ │
│  │  • Streaming render updates                        │ │
│  │  • Error display                                   │ │
│  └────────────────────────────────────────────────────┘ │
│                         ↕                               │
│  ┌────────────────────────────────────────────────────┐ │
│  │      CLI Framework Layer (commander.js)            │ │
│  │  • Command parsing (chat, config, export, etc)     │ │
│  │  • Argument validation                             │ │
│  │  • Help text generation                            │ │
│  └────────────────────────────────────────────────────┘ │
│                         ↕                               │
│  ┌────────────────────────────────────────────────────┐ │
│  │     Model Abstraction Layer                        │ │
│  │  • LLM Provider interface (OpenAI-compatible API)  │ │
│  │  • Claude (Anthropic)                              │ │
│  │  • OpenAI (GPT-4, GPT-3.5)                         │ │
│  │  • Gemini (Google)                                 │ │
│  │  • OpenRouter (meta-provider)                      │ │
│  │  • Streaming via node-fetch                        │ │
│  │  • Token estimation                                │ │
│  └────────────────────────────────────────────────────┘ │
│                         ↕                               │
│  ┌────────────────────────────────────────────────────┐ │
│  │      Chat Management & State                       │ │
│  │  • ChatSession (messages, metadata)                │ │
│  │  • Context windowing (smart truncation)            │ │
│  │  • Message history                                 │ │
│  │  • System prompt management                        │ │
│  └────────────────────────────────────────────────────┘ │
│                         ↕                               │
│  ┌────────────────────────────────────────────────────┐ │
│  │       Storage & Config Layer                       │ │
│  │  • SQLite (better-sqlite3)                         │ │
│  │  • TOML config file (~/.config/silo/config.toml)   │ │
│  │  • XDG paths compliance                            │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Core Components

### 4.1 TUI Layer

**Responsibility:** Render interface and handle user input.

**Key Modules:**
- `ui/components/App.tsx` — Root component
- `ui/components/Layout.tsx` — Screen composition (header, chat area, sidebar, input)
- `ui/components/ChatView.tsx` — Message rendering and streaming
- `ui/components/InputBox.tsx` — User input with history
- `ui/components/Sidebar.tsx` — Conversation list
- `ui/components/Settings.tsx` — Configuration panel
- `ui/hooks/useKeybindings.ts` — Keyboard/mouse event handling
- `ui/hooks/useStreaming.ts` — Streaming response management
- `ui/theme/index.ts` — Color scheme and styling

**Component Architecture:**

```tsx
// ui/components/App.tsx
import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Layout } from './Layout.js';
import { useChat } from '../hooks/useChat.js';

export const App: React.FC = () => {
  const [view, setView] = useState<'chat' | 'sidebar' | 'settings'>('chat');
  const { messages, sendMessage, isStreaming, currentResponse } = useChat();

  return (
    <Box flexDirection="column" height="100%">
      <Header 
        view={view} 
        onViewChange={setView} 
        model={currentModel} 
      />
      <Layout 
        view={view}
        messages={messages}
        isStreaming={isStreaming}
        currentResponse={currentResponse}
        onSendMessage={sendMessage}
      />
    </Box>
  );
};
```

**Screen States:**

1. **Main Chat View**
   ```
   ┌─────────────────────────────────────────────────────┐
   │ [≡] silo - Claude Sonnet 5.6                    [+] │
   │                                                     │
   │ You: Hello, can you help me with Rust?              │
   │                                                     │
   │ Claude: Sure! What do you need help with?           │
   │                                                     │
   │ You: I'm confused about lifetimes                   │
   │                                                     │
   │ Claude: Lifetimes are...                            │
   │ [▌ streaming...                                     │
   │                                                     │
   │ > Type your message...                              │
   └─────────────────────────────────────────────────────┘
   ```

2. **Sidebar View** (when [≡] clicked)
   ```
   ┌─────────────────────────────────────────────────────┐
   │ Conversations                                      │
   │ • Chat with Claude (2026-08-31)                    │
   │ • Rust Help Session (2026-08-30)                   │
   │ • Project Planning (2026-08-29)                    │
   │                                                    │
   │ [New Chat] [Settings] [Models]                     │
   └─────────────────────────────────────────────────────┘
   ```

3. **Settings Panel** (when settings clicked)
   ```
   ┌─────────────────────────────────────────────────────┐
   │ Model Settings                                     │
   │ • Current Model: Claude (Anthropic)                │
   │ • Temperature: 0.7                                 │
   │ • Max Tokens: 2000                                 │
   │                                                    │
   │ Provider Settings                                  │
   │ • OpenAI API Key: [configured]                     │
   │ • Claude API Key: [configured]                     │
   │ • Gemini API Key: [not configured]                 │
   └─────────────────────────────────────────────────────┘
   ```

**Design Principles:**
- Minimal visual clutter (focus on chat)
- Keyboard-first interaction
- Smooth transitions between modes
- Clear visual feedback for all actions

### 4.2 Model Abstraction Layer

**Responsibility:** Unified interface to multiple LLM providers.

**Supported Providers (MVP):**
1. **Claude (Anthropic)** — Primary focus, full feature support
2. **OpenAI** — GPT-4, GPT-3.5-turbo
3. **Gemini (Google)** — Basic support
4. **OpenRouter** — Meta-provider (route to multiple models)

**Core Interface:**

```tsx
// models/types.ts
export interface LLMProvider {
  sendMessage(
    messages: ChatMessage[],
    modelConfig: ModelConfig
  ): Promise<AsyncGenerator<StreamChunk>>;

  estimateTokens(text: string): number;

  getName(): string;
  getDefaultModel(): string;
  validateConfig(config: ModelConfig): Promise<boolean>;
}

export interface StreamChunk {
  type: 'content' | 'error' | 'done';
  content?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ModelConfig {
  provider: 'anthropic' | 'openai' | 'google' | 'openrouter';
  model: string;
  apiKey: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}
```

**Message Format (Internal):**

```tsx
// chat/types.ts
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  tokens?: number;
  id: string;
}

export interface ChatSession {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  model: string;
  provider: string;
  messages: ChatMessage[];
  systemPrompt: string;
  title?: string;
  metadata: Record<string, unknown>;
}
```

**Response Handling:**
- Stream responses token-by-token using async generators
- Handle rate limits gracefully (exponential backoff)
- Automatic retry logic for transient failures
- Provider-specific error mapping

### 4.3 Chat Management Layer

**Responsibility:** State management, context windowing, conversation persistence.

**Context Window Strategy:**

```tsx
// chat/context.ts
export class ContextManager {
  private readonly bufferTokens = 500;
  private readonly maxTokens: number;

  constructor(modelMaxTokens: number) {
    this.maxTokens = modelMaxTokens - this.bufferTokens;
  }

  buildContext(messages: ChatMessage[], systemPrompt: string): ChatMessage[] {
    let totalTokens = this.estimateTokens(systemPrompt);
    const context: ChatMessage[] = [];
    
    // Always include system prompt
    context.push({ role: 'system', content: systemPrompt, timestamp: new Date() });
    
    // Start from most recent and work backwards
    const reversed = [...messages].reverse();
    let truncated = false;
    
    for (const msg of reversed) {
      const msgTokens = this.estimateTokens(msg.content);
      if (totalTokens + msgTokens > this.maxTokens) {
        truncated = true;
        break;
      }
      totalTokens += msgTokens;
      context.unshift(msg);
    }
    
    if (truncated) {
      // Add truncation marker
      context.unshift({
        role: 'system',
        content: '... (earlier messages truncated due to context length)',
        timestamp: new Date()
      });
    }
    
    return context;
  }

  estimateTokens(text: string): number {
    // Simple approximation: ~4 chars per token
    return Math.ceil(text.length / 4);
  }
}
```

**Operations:**
- Load chat by ID
- Append message (auto-save)
- Get context window for API call
- Export chat (JSON, Markdown)
- Delete chat (soft delete initially)

### 4.4 Storage Layer

**SQLite Schema:**

```sql
-- storage/schema.sql
CREATE TABLE chats (
    id TEXT PRIMARY KEY,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    model TEXT NOT NULL,
    provider TEXT NOT NULL,
    title TEXT,
    system_prompt TEXT DEFAULT '',
    metadata JSON
);

CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    role TEXT NOT NULL, -- 'user', 'assistant', 'system'
    content TEXT NOT NULL,
    timestamp DATETIME NOT NULL,
    estimated_tokens INTEGER,
    FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE
);

CREATE INDEX idx_messages_chat_id ON messages(chat_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
CREATE INDEX idx_chats_updated_at ON chats(updated_at);
```

**Database Location:**
- Linux: `~/.local/share/silo/silo.db`
- Config: `~/.config/silo/config.toml`

**Auto-save Strategy:**
- Save after each user message
- Save after streaming completes
- Periodic backup (every 50 messages)

### 4.5 Config System

**File: `~/.config/silo/config.toml`**

```toml
[general]
default_model = "claude"
theme = "dark"
context_strategy = "smart_truncation"

[models.claude]
provider = "anthropic"
api_key_env = "ANTHROPIC_API_KEY"
model = "claude-5-sonnet"
temperature = 0.7
max_tokens = 2000

[models.openai]
provider = "openai"
api_key_env = "OPENAI_API_KEY"
model = "gpt-5.6-terra"
temperature = 0.7
max_tokens = 2000

[models.gemini]
provider = "google"
api_key_env = "GOOGLE_API_KEY"
model = "gemini-3.5-flash"
temperature = 0.7
max_tokens = 2000

[models.openrouter]
provider = "openrouter"
api_key_env = "OPENROUTER_API_KEY"
model = "poolside-ai/laguna-2.1-xs"
temperature = 0.7
max_tokens = 2000

[appearance]
primary_color = "#00bfff"
accent_color = "#ff00ff"
compact_mode = false
```

**Config Validation:**

```tsx
// config/validator.ts
export class ConfigValidator {
  validate(config: SiloConfig): ValidationResult {
    const errors: string[] = [];
    
    // Check required fields
    if (!config.general.default_model) {
      errors.push('general.default_model is required');
    }
    
    // Validate models
    for (const [name, model] of Object.entries(config.models)) {
      if (!model.provider) {
        errors.push(`models.${name}.provider is required`);
      }
      
      // Check API key availability
      if (model.api_key_env && !process.env[model.api_key_env]) {
        errors.push(`Environment variable ${model.api_key_env} not set for model ${name}`);
      }
    }
    
    return { valid: errors.length === 0, errors };
  }
}
```

---

## 5. User Workflows

### 5.1 Launch & Initial Setup

```bash
$ silo

[Launch screen with ASCII art]

 ███████╗  ██╗ ██╗       ██████╗
 ██╔════╝ ███║ ██║      ██╔═████╗
 ███████╗ ╚██║ ██║      ██║██╔██║
 ╚════██║  ██║ ██║      ████╔╝██║
 ███████║  ██║ ███████╗ ╚██████╔╝
 ╚══════╝  ╚═╝ ╚══════╝  ╚═════╝

✓ Config found at ~/.config/silo/config.toml
✓ Database initialized
✓ anthropic/claude-5-sonnet configured and ready

[Empty chat box]
> 
```

**First Run:**
- Check if config exists
- If not, create template config
- Prompt for API keys (or guide to docs)
- Initialize SQLite database
- Load most recent chat or create new one

### 5.2 Normal Chat Flow

```
User types: "What is Rust?"
    ↓
Validate input (not empty)
    ↓
Save user message to DB (optimistic)
    ↓
Build context window from history
    ↓
Send to selected provider (stream)
    ↓
Render tokens as they arrive
    ↓
User presses Ctrl+C (optional interrupt)
    ↓
Save assistant message to DB
    ↓
Ready for next input
```

### 5.3 Sidebar Navigation

```
[≡] clicked
    ↓
Show sidebar overlay

Recent Chats:
• Rust Lifetimes (2026-08-31, 15:42)
• Project Planning (2026-08-30, 10:15)
• General Q&A (2026-08-29, 18:30)

[+ New Chat]
[⚙ Settings]
[⚛ Models]

User selects chat or action
    ↓
Load selected chat or open panel
    ↓
Render content
```

### 5.4 Model Switching

```
Settings → Models

Current: Claude (Anthropic)

Available:
1. anthropic/claude-5-sonnet | Claude 5 Sonnet
2. openai/gpt-5.6-terra | GPT-5.6 Terra
3. google/gemini-3.5-flash | Gemini 3.5 Flash
4. openrouter/poolside-ai/laguna-2.1-xs | Laguna 2.1XS

Select model: 2
    ↓
Switch to GPT-5.6 Terra for this chat
    ↓
Context rebuilt with new token limits
    ↓
Ready to chat
```

---

## 6. Error Handling

**Display Strategy:**

All errors shown in-line with `E:` prefix (red text):

```
E: API key for Claude not found. Set ANTHROPIC_API_KEY or configure in settings.
```

**Error Types:**

| Error | Display | Recovery |
|-------|---------|----------|
| Missing API key | `E: API key not configured for {model}` | Guide to settings |
| Network timeout | `E: Request timed out. Retrying...` | Auto-retry, then fail |
| Invalid token limit | `E: Context window exceeded. Truncating history.` | Reduce context, continue |
| Rate limit | `E: Rate limited. Waiting...` | Queue and retry |
| Invalid config | `E: Config parse error at line X` | Show line, guide to fix |

**No crashes in production.** All errors map to user-friendly messages.

---

## 7. Project Structure

```
silo/
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── esbuild.config.js
├── .gitignore
├── README.md
├── src/
│   ├── index.ts                    # Entry point
│   ├── cli.ts                      # Commander.js setup
│   ├── config/
│   │   ├── index.ts                # Config loading/validation
│   │   ├── defaults.ts             # Default configurations
│   │   └── validator.ts            # Config validation
│   ├── storage/
│   │   ├── index.ts                # Storage abstraction
│   │   ├── database.ts             # SQLite implementation
│   │   └── schema.ts               # Database schema
│   ├── models/
│   │   ├── index.ts                # Model abstraction
│   │   ├── types.ts                # LLMProvider interface
│   │   ├── anthropic.ts            # Claude/Anthropic impl
│   │   ├── openai.ts               # OpenAI impl
│   │   ├── google.ts               # Gemini impl
│   │   └── openrouter.ts           # OpenRouter impl
│   ├── chat/
│   │   ├── index.ts                # Chat logic
│   │   ├── session.ts              # ChatSession management
│   │   ├── context.ts              # Context windowing
│   │   └── types.ts                # Message types
│   ├── ui/
│   │   ├── index.ts                # UI root
│   │   ├── components/
│   │   │   ├── App.tsx             # Root component
│   │   │   ├── Layout.tsx          # Screen composition
│   │   │   ├── ChatView.tsx        # Message rendering
│   │   │   ├── InputBox.tsx        # User input
│   │   │   ├── Sidebar.tsx         # Conversation list
│   │   │   ├── Settings.tsx        # Settings panel
│   │   │   └── Header.tsx          # App header
│   │   ├── hooks/
│   │   │   ├── useChat.ts          # Chat state management
│   │   │   ├── useStreaming.ts     # Streaming responses
│   │   │   ├── useKeybindings.ts   # Keyboard shortcuts
│   │   │   └── useConfig.ts        # Config management
│   │   └── theme/
│   │       ├── index.ts            # Theme definitions
│   │       └── colors.ts           # Color palette
│   ├── error/
│   │   ├── index.ts                # Error types
│   │   └── display.ts              # Error display formatting
│   └── utils/
│       ├── index.ts
│       ├── tokens.ts               # Token estimation
│       ├── markdown.ts             # Markdown formatting
│       └── time.ts                 # Time formatting
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
└── docs/
    ├── API.md                      # Provider API details
    ├── CONFIG.md                   # Configuration guide
    └── DEVELOPMENT.md              # Dev setup
```

---

## 8. Development Roadmap

### Phase 1: MVP (Week 1)
- [ ] Project scaffolding (pnpm init, TypeScript, esbuild)
- [ ] Ink + React setup
- [ ] SQLite integration
- [ ] Claude provider (Anthropic)
- [ ] Basic chat UI (input, display, navigation)
- [ ] Config loading (TOML)
- [ ] Basic error handling

### Phase 2: Multi-Provider (Week 2)
- [ ] OpenAI provider
- [ ] Gemini provider
- [ ] OpenRouter provider
- [ ] Model switching UI
- [ ] Provider configuration panel

### Phase 3: Polish (Week 3)
- [ ] Streaming optimization
- [ ] Context windowing refinement
- [ ] UI/UX tweaks
- [ ] Documentation
- [ ] Release build + npm publish

### Phase 4: V0.1 Features (Post-MVP)
- [ ] Chat export (Markdown, JSON)
- [ ] Search within chats
- [ ] Chat tagging/organizing
- [ ] Custom system prompts per chat
- [ ] Keyboard shortcuts guide
- [ ] Theme customization

---

## 9. Design Principles

**Minimal:** Only essential UI elements. No decorative cruft.

**Beautiful:** Every interaction should feel intentional. Smooth transitions, clear feedback.

**Fast:** Responsive input, streaming responses, no loading spinners.

**Ownership:** Data lives locally. User controls configuration.

**Interoperable:** Easy to switch providers, export chats, integrate with other tools.

**Linux-native:** Uses Linux conventions (XDG paths, systemd if needed, Flatpak distribution).

---

## 10. Non-Goals (MVP)

- Cloud sync (data stays local)
- Voice input/output (text only)
- Image support (text only)
- Desktop app (terminal only)

---

## 11. Success Criteria

- [x] Codebase is clean and TypeScript-idiomatic
- [x] Zero crashes in normal operation
- [x] All errors are user-friendly
- [x] Config system works without friction
- [x] Multiple providers actually work
- [x] Context windowing is smart (not naive truncation)
- [x] Streaming feels responsive
- [x] Code is documented (doc comments on public APIs)
- [x] Build time is reasonable (<30s incremental)
- [x] Binary size is acceptable (<15MB)

---

## Appendix: Ink Component Example

**Example Chat View Component:**

```tsx
// ui/components/ChatView.tsx
import React from 'react';
import { Box, Text } from 'ink';
import { ChatMessage } from '../../chat/types.js';

interface ChatViewProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  currentResponse?: string;
}

export const ChatView: React.FC<ChatViewProps> = ({ 
  messages, 
  isStreaming, 
  currentResponse 
}) => {
  return (
    <Box flexDirection="column" padding={1}>
      {messages.map((msg) => (
        <Box key={msg.id} marginBottom={1}>
          <Text color={msg.role === 'user' ? 'cyan' : 'green'} bold>
            {msg.role === 'user' ? 'You: ' : 'Assistant: '}
          </Text>
          <Text>{msg.content}</Text>
        </Box>
      ))}
      
      {isStreaming && currentResponse && (
        <Box>
          <Text color="green" bold>Assistant: </Text>
          <Text>{currentResponse}</Text>
          <Text color="gray">▌</Text>
        </Box>
      )}
    </Box>
  );
};
```

**Example Streaming Hook:**

```tsx
// ui/hooks/useStreaming.ts
import { useState, useCallback } from 'react';
import { LLMProvider } from '../../models/types.js';
import { ChatMessage } from '../../chat/types.js';

export function useStreaming(provider: LLMProvider) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const [error, setError] = useState<string | null>(null);

  const streamResponse = useCallback(async (
    messages: ChatMessage[],
    config: ModelConfig
  ) => {
    setIsStreaming(true);
    setCurrentResponse('');
    setError(null);

    try {
      const stream = await provider.sendMessage(messages, config);
      
      for await (const chunk of stream) {
        if (chunk.type === 'content') {
          setCurrentResponse(prev => prev + chunk.content);
        } else if (chunk.type === 'error') {
          setError(chunk.error || 'Unknown error');
          break;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsStreaming(false);
    }
  }, [provider]);

  return { isStreaming, currentResponse, error, streamResponse };
}
```

---

**End of Specification**
