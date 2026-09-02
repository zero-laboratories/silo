import React, { useMemo, useRef, useState } from 'react';
import { useKeyboard } from '@opentui/react';
import type { KeyEvent } from '@opentui/core';
import { Logo } from './Logo.js';
import { Sidebar } from './Sidebar.js';
import { Settings } from './Settings.js';
import { HelpOverlay } from './HelpOverlay.js';
import type { ChatManager } from '../../chat/session.js';
import type { ChatMessage, ChatSession } from '../../chat/types.js';
import type { SiloConfig } from '../../config/type.js';
import { toUserError } from '../../error/index.js';
import { BOLD, DIM, BOLD_INVERSE, INVERSE } from '../styles.js';

type View = 'chat' | 'sidebar' | 'settings';

interface AppProps {
  manager: ChatManager;
  config: SiloConfig;
  onRequestClose?: () => void;
}

function inputCharOf(e: KeyEvent): string {
  return e.name.length === 1 ? e.sequence : '';
}

export function App({ manager, config, onRequestClose }: AppProps) {
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = manager.session;
  const [messages, setMessages] = useState<ChatMessage[]>(session.messages);
  const [chats, setChats] = useState<ChatSession[]>(() => manager.listChats());
  const [view, setView] = useState<View>('chat');
  const [chatIdx, setChatIdx] = useState(0);
  const [modelIdx, setModelIdx] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [tagging, setTagging] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [promptEdit, setPromptEdit] = useState<string | null>(null);
  const [promptInput, setPromptInput] = useState('');
  const [msgIdx, setMsgIdx] = useState<number | null>(null);
  const [msgCursor, setMsgCursor] = useState(0);
  const [msgEditing, setMsgEditing] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [search, setSearch] = useState<{
    active: boolean;
    query: string;
    results: ChatMessage[];
    idx: number;
  }>({ active: false, query: '', results: [], idx: 0 });
  const [helpVisible, setHelpVisible] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useKeyboard((e) => {
    const inputChar = inputCharOf(e);
    const isReturn = e.name === 'return';
    const isEscape = e.name === 'escape';
    const isUp = e.name === 'up';
    const isDown = e.name === 'down';
    const isBack = e.name === 'backspace' || e.name === 'delete';

    if (isStreaming) {
      if (e.ctrl) {
        abortRef.current?.abort();
        setIsStreaming(false);
      }
      return;
    }

    if (e.ctrl && e.name === 'x') {
      onRequestClose?.();
      return;
    }

    if (helpVisible) {
      if (inputChar === '?' || isEscape) setHelpVisible(false);
      return;
    }

    if (inputChar === '?') {
      setHelpVisible(true);
      return;
    }

    if (confirmDelete !== null) {
      if (isReturn || inputChar === 'y' || inputChar === 'Y') {
        doDeleteChat(confirmDelete);
        setConfirmDelete(null);
      } else if (inputChar === 'n' || inputChar === 'N' || isEscape) {
        setConfirmDelete(null);
      }
      return;
    }

    if (renaming !== null) {
      if (isReturn) {
        doRenameChat(renaming, renameInput);
        setRenaming(null);
        setRenameInput('');
      } else if (isEscape) {
        setRenaming(null);
        setRenameInput('');
      } else if (isBack) {
        setRenameInput((prev) => prev.slice(0, -1));
      } else if (inputChar) {
        setRenameInput((prev) => prev + inputChar);
      }
      return;
    }

    if (tagging !== null) {
      if (isReturn) {
        doSetTags(tagging, tagInput);
        setTagging(null);
        setTagInput('');
      } else if (isEscape) {
        setTagging(null);
        setTagInput('');
      } else if (isBack) {
        setTagInput((prev) => prev.slice(0, -1));
      } else if (inputChar) {
        setTagInput((prev) => prev + inputChar);
      }
      return;
    }

    if (promptEdit !== null) {
      if (isReturn) {
        doSetSystemPrompt(promptEdit, promptInput);
        setPromptEdit(null);
        setPromptInput('');
      } else if (isEscape) {
        setPromptEdit(null);
        setPromptInput('');
      } else if (isBack) {
        setPromptInput((prev) => prev.slice(0, -1));
      } else if (inputChar) {
        setPromptInput((prev) => prev + inputChar);
      }
      return;
    }

    if (search.active) {
      if (isReturn) {
        setSearch((s) => ({ ...s, active: false }));
        return;
      }
      if (isEscape) {
        setSearch((s) => ({ ...s, active: false, query: '', results: [] }));
        return;
      }
      if (isUp) {
        setSearch((s) => ({ ...s, idx: Math.max(0, s.idx - 1) }));
        return;
      }
      if (isDown) {
        setSearch((s) => ({ ...s, idx: Math.min(s.results.length - 1, s.idx + 1) }));
        return;
      }
      if (isBack) {
        setSearch((s) => {
          const query = s.query.slice(0, -1);
          return { ...s, query, results: manager.searchChat(session.id, query), idx: 0 };
        });
        return;
      }
      if (inputChar) {
        setSearch((s) => {
          const query = s.query + inputChar;
          return { ...s, query, results: manager.searchChat(session.id, query), idx: 0 };
        });
        return;
      }
      return;
    }

    if (msgIdx !== null) {
      if (isEscape) {
        setMsgIdx(null);
        setMsgCursor(0);
        return;
      }
      if (isReturn) {
        setMsgIdx(null);
        return;
      }
      if (isUp) setMsgCursor((c) => Math.max(0, c - 1));
      else if (isDown)
        setMsgCursor((c) => Math.min(messages.length - 1, c + 1));
      else if (inputChar === 'e' || inputChar === 'E') {
        editMessage(messages[msgCursor]);
        setMsgIdx(null);
      } else if (inputChar === 'd' || inputChar === 'D') {
        deleteMessage(messages[msgCursor]);
        setMsgIdx(null);
      }
      return;
    }

    if (msgEditing !== null) {
      if (isReturn) {
        doEditMessage(msgEditing, editContent);
        setMsgEditing(null);
        setEditContent('');
        return;
      }
      if (isEscape) {
        setMsgEditing(null);
        setEditContent('');
        return;
      }
      if (isBack) {
        setEditContent((prev) => prev.slice(0, -1));
      } else if (inputChar) {
        setEditContent((prev) => prev + inputChar);
      }
      return;
    }

    if (e.ctrl) {
      const ch = e.name?.toLowerCase();
      if (ch === 's') {
        setView((v) => (v === 'sidebar' ? 'chat' : 'sidebar'));
        setChats(manager.listChats());
      } else if (ch === 'g') {
        setView((v) => (v === 'settings' ? 'chat' : 'settings'));
      } else if (ch === 't') {
        startNewChat();
      } else if (ch === 'c') {
        setView('chat');
      } else if (ch === 'f') {
        setSearch({ active: true, query: '', results: [], idx: 0 });
      }
      return;
    }

    if (isEscape) {
      setView('chat');
      return;
    }

    if (view === 'sidebar') {
      if (isUp) setChatIdx((i) => Math.max(0, i - 1));
      else if (isDown) setChatIdx((i) => Math.min(chats.length - 1, i + 1));
      else if (isReturn) {
        const chat = chats[chatIdx];
        if (chat && chat.id !== session.id) openChat(chat.id);
      } else if (inputChar === 'd' || inputChar === 'D') {
        const chat = chats[chatIdx];
        if (chat) setConfirmDelete(chat.id);
      } else if (inputChar === 'r' || inputChar === 'R') {
        const chat = chats[chatIdx];
        if (chat) {
          setRenaming(chat.id);
          setRenameInput(chat.title ?? '');
        }
      } else if (inputChar === 't' || inputChar === 'T') {
        const chat = chats[chatIdx];
        if (chat) {
          setTagging(chat.id);
          setTagInput((chat.tags ?? []).join(', '));
        }
      } else if (inputChar === 'p' || inputChar === 'P') {
        const chat = chats[chatIdx];
        if (chat) {
          setPromptEdit(chat.id);
          setPromptInput(chat.systemPrompt);
        }
      }
      return;
    }

    if (view === 'settings') {
      const names = Object.keys(config.models);
      if (isUp) setModelIdx((i) => Math.max(0, i - 1));
      else if (isDown) setModelIdx((i) => Math.min(names.length - 1, i + 1));
      else if (isReturn) {
        const name = names[modelIdx];
        if (name && name !== manager.currentModel) {
          const res = manager.switchModel(name);
          if (!res.ok) setError(`E: ${res.error ?? 'Failed to switch model'}`);
          else setError(null);
        }
      }
      return;
    }

    if (inputChar === 'e' || inputChar === 'E') {
      if (messages.length > 0) {
        setMsgIdx(0);
        setMsgCursor(messages.length - 1);
      }
      return;
    }

    if (isReturn) {
      const text = input.trim();
      if (text.length === 0) return;
      setInput('');
      void sendMessage(text);
      return;
    }

    if (isBack) {
      setInput((prev) => prev.slice(0, -1));
      return;
    }

    if (inputChar) {
      setInput((prev) => prev + inputChar);
    }
  });

  async function sendMessage(text: string) {
    const controller = new AbortController();
    abortRef.current = controller;
    setIsStreaming(true);
    setStreaming('');
    setError(null);

    setMessages((prev) => [
      ...prev,
      {
        id: `pending-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: new Date(),
      },
    ]);

    try {
      for await (const chunk of manager.send(text, controller.signal)) {
        if (chunk.type === 'content' && chunk.content) {
          setStreaming((prev) => prev + (chunk.content ?? ''));
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(toUserError(err));
    } finally {
      setIsStreaming(false);
      setStreaming('');
      setMessages(manager.session.messages);
      setChats(manager.listChats());
      const chat = manager.session;
      const isFirstExchange =
        chat.messages.filter((m) => m.role === 'user').length === 1 &&
        chat.messages.some((m) => m.role === 'assistant');
      if (isFirstExchange) {
        const id = manager.session.id;
        void manager.generateTitle(id).then((title) => {
          if (title) setChats(manager.listChats());
        });
      }
    }
  }

  function startNewChat() {
    manager.newChat();
    setMessages([]);
    setInput('');
    setError(null);
    setStreaming('');
    setChats(manager.listChats());
    setView('chat');
  }

  function openChat(id: string) {
    manager.switchChat(id);
    setMessages(manager.session.messages);
    setInput('');
    setError(null);
    setView('chat');
  }

  function doDeleteChat(id: string) {
    manager.deleteChat(id);
    const next = manager.listChats();
    setChats(next);
    setChatIdx((i) => Math.max(0, Math.min(i, next.length - 1)));
    setMessages(manager.session.messages);
    setError(null);
  }

  function doRenameChat(id: string, title: string) {
    manager.renameChat(id, title.trim());
    setChats(manager.listChats());
  }

  function doSetTags(id: string, raw: string) {
    const tags = raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    manager.setChatTags(id, tags);
    setChats(manager.listChats());
    setMessages(manager.session.messages);
  }

  function doSetSystemPrompt(id: string, prompt: string) {
    manager.setSystemPrompt(id, prompt);
    setChats(manager.listChats());
    setMessages(manager.session.messages);
  }

  function editMessage(msg: ChatMessage | undefined) {
    if (!msg) return;
    setMsgEditing(msg.id);
    setEditContent(msg.content);
  }

  function deleteMessage(msg: ChatMessage | undefined) {
    if (!msg) return;
    manager.deleteMessage(session.id, msg.id);
    setMessages(manager.session.messages);
    setChats(manager.listChats());
  }

  function doEditMessage(id: string, content: string) {
    manager.updateMessage(session.id, id, content);
    setMessages(manager.session.messages);
    setChats(manager.listChats());
  }

  if (helpVisible) {
    return (
      <box flexDirection="column" flexGrow={1}>
        <HelpOverlay />
      </box>
    );
  }

  return (
    <box flexDirection="column" flexGrow={1}>
      <Header manager={manager} view={view} isStreaming={isStreaming} />
      <box flexDirection="row" flexGrow={1}>
        {view === 'sidebar' && (
          <box flexDirection="column">
            <Sidebar chats={chats} activeId={session.id} selected={chatIdx} />
            {confirmDelete && (
              <box
                borderStyle="single"
                borderColor="yellow"
                paddingX={1}
                width={34}
                marginTop={1}
              >
                <text fg="yellow" attributes={BOLD}>
                  Delete selected conversation? (y/N)
                </text>
              </box>
            )}
            {renaming && (
              <box
                borderStyle="single"
                borderColor="cyan"
                paddingX={1}
                width={34}
                marginTop={1}
              >
                <text fg="cyan">New title: </text>
                {renameInput.length > 0 ? (
                  <>
                    <text>{renameInput}</text>
                    <text attributes={INVERSE}> </text>
                  </>
                ) : (
                  <text attributes={INVERSE}> </text>
                )}
              </box>
            )}
            {tagging && (
              <box
                borderStyle="single"
                borderColor="magenta"
                paddingX={1}
                width={34}
                marginTop={1}
              >
                <text fg="magenta">Tags (comma sep): </text>
                {tagInput.length > 0 ? (
                  <>
                    <text>{tagInput}</text>
                    <text attributes={INVERSE}> </text>
                  </>
                ) : (
                  <text attributes={INVERSE}> </text>
                )}
              </box>
            )}
            {promptEdit && (
              <box
                borderStyle="single"
                borderColor="green"
                paddingX={1}
                width={34}
                marginTop={1}
              >
                <text fg="green">System prompt: </text>
                {promptInput.length > 0 ? (
                  <>
                    <text>{promptInput}</text>
                    <text attributes={INVERSE}> </text>
                  </>
                ) : (
                  <text attributes={INVERSE}> </text>
                )}
              </box>
            )}
          </box>
        )}
        {view === 'settings' && (
          <Settings
            config={config}
            currentModel={manager.currentModel}
            selected={modelIdx}
          />
        )}
        <box flexDirection="column" flexGrow={1}>
          {search.active && (
            <SearchBar query={search.query} count={search.results.length} />
          )}
          <box
            flexDirection="column"
            flexGrow={1}
            justifyContent="flex-end"
            alignItems="center"
          >
            {search.active ? (
              <SearchResults results={search.results} selected={search.idx} />
            ) : messages.length === 0 && !isStreaming && !streaming && !error ? (
              <WelcomeScreen />
            ) : (
              <box flexDirection="column" flexGrow={1}>
                <Layout
                  messages={messages}
                  streaming={streaming}
                  isStreaming={isStreaming}
                  error={error}
                  selectable={msgIdx !== null}
                  selected={msgCursor}
                />
              </box>
            )}
          </box>
          {msgIdx !== null && msgEditing === null && (
            <box justifyContent="center" marginBottom={1}>
              <box borderStyle="single" borderColor="yellow" paddingX={1}>
                <text fg="yellow">
                  Select: ↑/↓ · e edit · d delete · Enter/Esc done
                </text>
              </box>
            </box>
          )}
          {msgEditing !== null && (
            <EditBar value={editContent} />
          )}
          <box alignItems="center" flexDirection="column">
            {!search.active && msgIdx === null && msgEditing === null && (
              <InputBox value={input} isStreaming={isStreaming} />
            )}
          </box>
        </box>
      </box>
    </box>
  );
}

function WelcomeScreen() {
  return (
    <box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      flexGrow={1}
    >
      <Logo />
      <text> </text>
      <text fg="cyan" attributes={BOLD}>
        Welcome to Silo
      </text>
      <text attributes={DIM}>
        A CLI chat app. Type a message to get started.
      </text>
      <text> </text>
      <box flexDirection="column" alignItems="flex-start">
        <text>
          <span fg="yellow" attributes={BOLD}>{'  Ctrl+T '.padEnd(14)}</span>
          <span attributes={DIM}>New chat</span>
        </text>
        <text>
          <span fg="yellow" attributes={BOLD}>{'  Ctrl+S '.padEnd(14)}</span>
          <span attributes={DIM}>Sidebar</span>
        </text>
        <text>
          <span fg="yellow" attributes={BOLD}>{'  Ctrl+G '.padEnd(14)}</span>
          <span attributes={DIM}>Settings</span>
        </text>
        <text>
          <span fg="yellow" attributes={BOLD}>{'  ?      '.padEnd(14)}</span>
          <span attributes={DIM}>All shortcuts</span>
        </text>
      </box>
    </box>
  );
}

function Header({
  manager,
  view,
  isStreaming,
}: {
  manager: ChatManager;
  view: View;
  isStreaming: boolean;
}) {
  return (
    <box borderStyle="single" borderColor="gray" paddingX={1}>
      <box flexDirection="row" justifyContent="space-between" alignItems="center" width="100%">
        <box flexDirection="row" alignItems="center">
          <text fg="cyan" attributes={BOLD}>
            SILO
          </text>
          <text fg="gray"> · </text>
          <text>{manager.label}</text>
          {isStreaming && <text fg="green"> · typing…</text>}
        </box>
        <box flexDirection="row" alignItems="center">
          <text fg={view === 'sidebar' ? 'cyan' : 'gray'} attributes={view === 'sidebar' ? BOLD : undefined}>
            [≡] s
          </text>
          <text fg="gray"> </text>
          <text
            fg={view === 'settings' ? 'cyan' : 'gray'}
            attributes={view === 'settings' ? BOLD : undefined}
          >
            [⚙] g
          </text>
          <text fg="gray"> </text>
          <text fg={view === 'chat' ? 'cyan' : 'gray'} attributes={view === 'chat' ? BOLD : undefined}>
            [+] t
          </text>
        </box>
      </box>
    </box>
  );
}

function Layout({
  messages,
  streaming,
  isStreaming,
  error,
  selectable = false,
  selected = 0,
}: {
  messages: ChatMessage[];
  streaming: string;
  isStreaming: boolean;
  error: string | null;
  selectable?: boolean;
  selected?: number;
}) {
  return (
    <box flexDirection="column" flexGrow={1} width="100%" paddingX={1}>
      {messages.map((msg, i) => (
        <MessageView
          key={msg.id}
          message={msg}
          selectable={selectable}
          selected={selectable && i === selected}
        />
      ))}
      {isStreaming && (
        <box>
          <text fg="green" attributes={BOLD}>
            Assistant:{' '}
          </text>
          {streaming.length > 0 ? (
            <text>{normalizeMessage(streaming)}</text>
          ) : (
            <text attributes={DIM}>waiting for response…</text>
          )}
        </box>
      )}
      {error && <text fg="red">{error}</text>}
    </box>
  );
}

function normalizeMessage(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
}

function MessageView({
  message,
  selectable = false,
  selected = false,
}: {
  message: ChatMessage;
  selectable?: boolean;
  selected?: boolean;
}) {
  const name = message.role === 'user' ? 'You' : 'Assistant';
  const color = message.role === 'user' ? 'cyan' : 'green';
  const content = normalizeMessage(message.content);
  const marker = selectable ? (selected ? '» ' : '  ') : '';
  return (
    <box>
      <text
        fg={selected ? 'yellow' : color}
        attributes={selected ? BOLD_INVERSE : BOLD}
      >
        {marker}{name}:{' '}
      </text>
      {content.length > 0 ? (
        <text attributes={selected ? INVERSE : undefined}>{content}</text>
      ) : (
        <text attributes={DIM}>(no response)</text>
      )}
    </box>
  );
}

function SearchBar({ query, count }: { query: string; count: number }) {
  return (
    <box borderStyle="single" borderColor="magenta" width="100%" paddingX={1} marginBottom={1}>
      <text fg="magenta" attributes={BOLD}>
        Search:{' '}
      </text>
      {query.length > 0 ? (
        <>
          <text>{query}</text>
          <text attributes={INVERSE}> </text>
        </>
      ) : (
        <text attributes={DIM}>Type to search current chat…</text>
      )}
      <text fg="gray"> ({count} matches) · Enter/Esc done</text>
    </box>
  );
}

function SearchResults({
  results,
  selected,
}: {
  results: ChatMessage[];
  selected: number;
}) {
  const normalized = useMemo(
    () => results.map((msg) => ({ name: msg.role === 'user' ? 'You' : 'Assistant', content: normalizeMessage(msg.content) })),
    [results],
  );
  if (results.length === 0) {
    return (
      <box flexDirection="column" alignItems="center">
        <text attributes={DIM}>No matching messages.</text>
      </box>
    );
  }
  return (
    <box flexDirection="column" width="100%" paddingX={1}>
      {normalized.map((row, i) => {
        const color = row.name === 'You' ? 'cyan' : 'green';
        return (
          <box key={results[i].id}>
            <text
              fg={i === selected ? 'yellow' : color}
              attributes={i === selected ? BOLD_INVERSE : BOLD}
            >
              {i === selected ? '» ' : '  '}{row.name}:{' '}
            </text>
            <text attributes={i === selected ? INVERSE : undefined}>{row.content}</text>
          </box>
        );
      })}
    </box>
  );
}

function EditBar({ value }: { value: string }) {
  return (
    <box borderStyle="single" borderColor="yellow" width="100%" paddingX={1} marginBottom={1}>
      <text fg="yellow" attributes={BOLD}>
        Edit:{' '}
      </text>
      {value.length > 0 ? (
        <>
          <text>{value}</text>
          <text attributes={INVERSE}> </text>
        </>
      ) : (
        <text attributes={INVERSE}> </text>
      )}
      <text fg="gray"> · Enter save · Esc cancel</text>
    </box>
  );
}

function InputBox({ value, isStreaming }: { value: string; isStreaming: boolean }) {
  return (
    <box
      borderStyle="single"
      borderColor={isStreaming ? 'yellow' : 'gray'}
      width="50%"
      paddingX={1}
    >
      <text fg={isStreaming ? 'yellow' : 'cyan'}>
        {isStreaming ? '* ' : '> '}
      </text>
      {value.length > 0 ? (
        <>
          <text>{value}</text>
          <text attributes={INVERSE}> </text>
        </>
      ) : (
        <text attributes={DIM}>Ask anything...</text>
      )}
    </box>
  );
}