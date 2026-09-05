import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useKeyboard, usePaste, useRenderer } from '@opentui/react';
import { ClipboardTarget, createHostClipboard, decodePasteBytes } from '@opentui/core';
import type { HostClipboardService, ParsedKey } from '@opentui/core';
import { Logo } from './Logo.js';
import { Sidebar } from './Sidebar.js';
import { Settings } from './Settings.js';
import { HelpOverlay } from './HelpOverlay.js';
import { TabSwitcher, type Mode } from './TabSwitcher.js';
import { WorkLogo } from './WorkLogo.js';
import type { ChatManager } from '../../chat/session.js';
import type { ChatMessage, ChatSession } from '../../chat/types.js';
import type { SiloConfig } from '../../config/type.js';
import { toUserError } from '../../error/index.js';
import { BOLD, DIM, BOLD_INVERSE, INVERSE, color } from '../styles.js';

type View = 'chat' | 'sidebar' | 'settings';

interface AppProps {
  manager: ChatManager;
  config: SiloConfig;
  onRequestClose?: () => void;
}

export function inputCharOf(e: Pick<ParsedKey, 'name' | 'sequence'>): string {
  if (e.name === 'space') return ' ';
  return e.name.length === 1 ? e.sequence : '';
}

export function App({ manager, config, onRequestClose }: AppProps) {
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState('');
  const [toolStatus, setToolStatus] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = manager.session;
  const [messages, setMessages] = useState<ChatMessage[]>(session.messages);
  const [chats, setChats] = useState<ChatSession[]>(() => manager.listChats());
  const [view, setView] = useState<View>('chat');
  const [mode, setMode] = useState<Mode>('chat');
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
  const renderer = useRenderer();
  const hostClipboardRef = useRef<HostClipboardService | null>(null);

  const applyToActiveField = (fn: (prev: string) => string) => {
    if (renaming !== null) setRenameInput(fn);
    else if (tagging !== null) setTagInput(fn);
    else if (promptEdit !== null) setPromptInput(fn);
    else if (msgEditing !== null) setEditContent(fn);
    else if (search.active)
      setSearch((s) => {
        const query = fn(s.query);
        return { ...s, query, results: manager.searchChat(session.id, query), idx: 0 };
      });
    else setInput(fn);
  };

  const activeFieldValue = (): string => {
    if (renaming !== null) return renameInput;
    if (tagging !== null) return tagInput;
    if (promptEdit !== null) return promptInput;
    if (msgEditing !== null) return editContent;
    if (search.active) return search.query;
    return input;
  };

  const pasteFromHostClipboard = async (): Promise<void> => {
    try {
      if (!hostClipboardRef.current) {
        hostClipboardRef.current = createHostClipboard();
      }
      const result = await hostClipboardRef.current.read({ preferredTypes: ['text/plain'] });
      if (result.status === 'read') {
        const text = decodePasteBytes(result.representation.bytes);
        if (text) applyToActiveField((prev) => prev + text);
      }
    } catch {
      // best-effort: platforms without a readable clipboard are a no-op
    }
  };

  usePaste((ev) => {
    if (isStreaming) return;
    const text = decodePasteBytes(ev.bytes);
    if (text) applyToActiveField((prev) => prev + text);
  });

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

    if (e.ctrl && e.shift) {
      const ch = e.name?.toLowerCase();
      if (ch === 'v' || ch === 'c' || ch === 'x') {
        if (ch === 'v') {
          void pasteFromHostClipboard();
        } else {
          const text = activeFieldValue();
          if (text) renderer.copyToClipboardOSC52(text, ClipboardTarget.Clipboard);
          if (ch === 'x') applyToActiveField(() => '');
        }
        return;
      }
    }

    if (e.ctrl && e.name === 'x' && !e.shift) {
      onRequestClose?.();
      return;
    }

    if (helpVisible) {
      if (inputChar === '?' || isEscape) setHelpVisible(false);
      return;
    }

    if (input.length === 0 && inputChar === '?') {
      setHelpVisible(true);
      return;
    }

    if (e.name === 'tab') {
      setMode((m) => (m === 'chat' ? 'work' : 'chat'));
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
      if (ch === 's' || ch === 'd') {
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

    if (input.length === 0 && (inputChar === 'e' || inputChar === 'E')) {
      if (messages.length > 0) {
        setMsgIdx(0);
        setMsgCursor(messages.length - 1);
      }
      return;
    }

    if (isReturn) {
      const text = input.trim();
      if (text === '/exit') {
        onRequestClose?.();
        return;
      }
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
    setToolStatus([]);
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
        } else if (chunk.type === 'status' && chunk.status) {
          const line = chunk.status;
          setToolStatus((prev) => [...prev, line]);
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(toUserError(err));
    } finally {
      setIsStreaming(false);
      setStreaming('');
      setToolStatus([]);
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
    setToolStatus([]);
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
      {!(messages.length > 0 || isStreaming || streaming.length > 0 || error) && (
        <TabSwitcher mode={mode} onSelect={setMode} />
      )}
      {messages.length > 0 || isStreaming || streaming.length > 0 || error ? (
        <Header manager={manager} view={view} isStreaming={isStreaming} />
      ) : null}
      {(messages.length > 0 || isStreaming || streaming.length > 0 || error) ? (
        <box height={1} />
      ) : null}
      <box flexDirection="row" flexGrow={1}>
        {view === 'sidebar' && (
          <box flexDirection="column">
            <Sidebar
              chats={chats}
              activeId={session.id}
              selected={chatIdx}
              prompt={
                confirmDelete
                  ? { kind: 'confirmDelete', label: 'Delete conversation? (y/N)', value: '' }
                  : renaming
                    ? { kind: 'rename', label: 'New title: ', value: renameInput }
                    : tagging
                      ? { kind: 'tag', label: 'Tags (comma sep): ', value: tagInput }
                      : promptEdit
                        ? { kind: 'prompt', label: 'System prompt: ', value: promptInput }
                        : undefined
              }
            />
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
            alignItems="flex-start"
            paddingLeft={2}
          >
            {search.active ? (
              <SearchResults results={search.results} selected={search.idx} />
            ) : messages.length === 0 && !isStreaming && !streaming && !error ? (
              <WelcomeScreen mode={mode} />
            ) : (
              <box flexDirection="column" flexGrow={1}>
                <scrollbox flexGrow={1} scrollY>
                  <Layout
                    messages={messages}
                    streaming={streaming}
                    toolStatus={toolStatus}
                    isStreaming={isStreaming}
                    error={error}
                    selectable={msgIdx !== null}
                    selected={msgCursor}
                  />
                </scrollbox>
              </box>
            )}
          </box>
          {msgIdx !== null && msgEditing === null && (
            <box justifyContent="center" marginBottom={1}>
              <box borderStyle="single" borderColor={color.warning} paddingX={1}>
                <text fg={color.warning}>
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

const TIPS = [
  'Tip: Press Ctrl+T for a new chat',
  'Tip: Press Ctrl+S to open the sidebar',
  'Tip: Press Ctrl+G for model settings',
  'Tip: Press Ctrl+F to search the current chat',
  'Tip: Press Ctrl+C to stop streaming',
  'Tip: Press Ctrl+X to quit Silo',
  'Tip: Press ? to view all shortcuts',
  'Tip: Press e to edit or delete a message',
];

function WelcomeScreen({ mode }: { mode: Mode }) {
  const [tipIdx, setTipIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTipIdx((i) => (i + 1) % TIPS.length), 60_000);
    return () => clearInterval(id);
  }, []);
  return (
    <box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      width="100%"
      flexGrow={1}
    >
      {mode === 'work' ? <WorkLogo /> : <Logo />}
      <text> </text>
      <text attributes={DIM}>{TIPS[tipIdx]}</text>
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
    <box backgroundColor={color.inputBg} height={3} flexDirection="row" alignItems="center" paddingX={1}>
      <box flexDirection="row" justifyContent="space-between" alignItems="center" width="100%">
        <box flexDirection="row" alignItems="center">
          <text fg={color.primary} attributes={BOLD}>
            SILO
          </text>
          <text fg={color.muted}> · </text>
          <text fg={color.fg}>{manager.label}</text>
          {isStreaming && <text fg={color.success}> · typing…</text>}
        </box>
        <box flexDirection="row" alignItems="center">
          <text fg={view === 'sidebar' ? color.primary : color.muted} attributes={view === 'sidebar' ? BOLD : undefined}>
            [≡] s
          </text>
          <text fg={color.muted}> </text>
          <text
            fg={view === 'settings' ? color.primary : color.muted}
            attributes={view === 'settings' ? BOLD : undefined}
          >
            [⚙] g
          </text>
          <text fg={color.muted}> </text>
          <text fg={view === 'chat' ? color.primary : color.muted} attributes={view === 'chat' ? BOLD : undefined}>
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
  toolStatus,
  isStreaming,
  error,
  selectable = false,
  selected = 0,
}: {
  messages: ChatMessage[];
  streaming: string;
  toolStatus: string[];
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
          <text fg={color.success} attributes={BOLD}>
            Assistant:{' '}
          </text>
          {streaming.length > 0 ? (
            <text>{normalizeMessage(streaming)}</text>
          ) : toolStatus.length > 0 ? (
            <text attributes={DIM}>using tools…</text>
          ) : (
            <text attributes={DIM}>waiting for response…</text>
          )}
        </box>
      )}
      {toolStatus.length > 0 && (
        <box flexDirection="column">
          {toolStatus.map((line, i) => (
            <box key={`${i}-${line}`}>
              <text fg={color.accent} attributes={DIM}>
                ⚙ {line}
              </text>
            </box>
          ))}
        </box>
      )}
      {error && <text fg={color.error}>{error}</text>}
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
  const roleColor = message.role === 'user' ? color.primary : color.assistant;
  const content = normalizeMessage(message.content);
  const marker = selectable ? (selected ? '» ' : '  ') : '';
  return (
    <box>
      <text
        fg={selected ? color.warning : roleColor}
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
    <box borderStyle="single" borderColor={color.prompt} width="100%" paddingX={1} marginBottom={1}>
      <text fg={color.prompt} attributes={BOLD}>
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
      <text fg={color.muted}> ({count} matches) · Enter/Esc done</text>
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
        const roleColor = row.name === 'You' ? color.primary : color.assistant;
        return (
          <box key={results[i].id}>
            <text
              fg={i === selected ? color.warning : roleColor}
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
    <box borderStyle="single" borderColor={color.warning} width="100%" paddingX={1} marginBottom={1}>
      <text fg={color.warning} attributes={BOLD}>
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
      <text fg={color.muted}> · Enter save · Esc cancel</text>
    </box>
  );
}

export function InputBox({ value, isStreaming }: { value: string; isStreaming: boolean }) {
  return (
    <box
      height={3}
      width="50%"
      backgroundColor={isStreaming ? color.warning : color.inputBg}
      flexDirection="row"
      alignItems="center"
      paddingLeft={1}
      shouldFill
    >
      {value.length > 0 ? (
        <text fg={color.fg} attributes={BOLD}>
          {value}
          <span attributes={INVERSE}> </span>
        </text>
      ) : (
        <text fg={color.fg} attributes={DIM}>
          Ask anything...
        </text>
      )}
    </box>
  );
}