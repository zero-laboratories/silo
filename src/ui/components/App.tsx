import React, { useRef, useState } from 'react';
import { Box, Text, useInput, useWindowSize } from 'ink';
import { Logo } from './Logo.js';
import { Sidebar } from './Sidebar.js';
import { Settings } from './Settings.js';
import { HelpOverlay } from './HelpOverlay.js';
import type { ChatManager } from '../../chat/session.js';
import type { ChatMessage, ChatSession } from '../../chat/types.js';
import type { SiloConfig } from '../../config/type.js';
import { toUserError } from '../../error/index.js';

type View = 'chat' | 'sidebar' | 'settings';

interface AppProps {
  manager: ChatManager;
  config: SiloConfig;
}

export function App({ manager, config }: AppProps) {
  const { rows } = useWindowSize();
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

  useInput((inputChar, key) => {
    if (isStreaming) {
      if (key.ctrl) {
        abortRef.current?.abort();
        setIsStreaming(false);
      }
      return;
    }

    if (helpVisible) {
      if (inputChar === '?' || key.escape) setHelpVisible(false);
      return;
    }

    if (inputChar === '?') {
      setHelpVisible(true);
      return;
    }

    if (confirmDelete !== null) {
      if (key.return || inputChar === 'y' || inputChar === 'Y') {
        doDeleteChat(confirmDelete);
        setConfirmDelete(null);
      } else if (inputChar === 'n' || inputChar === 'N' || key.escape) {
        setConfirmDelete(null);
      }
      return;
    }

    if (renaming !== null) {
      if (key.return) {
        doRenameChat(renaming, renameInput);
        setRenaming(null);
        setRenameInput('');
      } else if (key.escape) {
        setRenaming(null);
        setRenameInput('');
      } else if (key.backspace || key.delete) {
        setRenameInput((prev) => prev.slice(0, -1));
      } else if (inputChar) {
        setRenameInput((prev) => prev + inputChar);
      }
      return;
    }

    if (tagging !== null) {
      if (key.return) {
        doSetTags(tagging, tagInput);
        setTagging(null);
        setTagInput('');
      } else if (key.escape) {
        setTagging(null);
        setTagInput('');
      } else if (key.backspace || key.delete) {
        setTagInput((prev) => prev.slice(0, -1));
      } else if (inputChar) {
        setTagInput((prev) => prev + inputChar);
      }
      return;
    }

    if (promptEdit !== null) {
      if (key.return) {
        doSetSystemPrompt(promptEdit, promptInput);
        setPromptEdit(null);
        setPromptInput('');
      } else if (key.escape) {
        setPromptEdit(null);
        setPromptInput('');
      } else if (key.backspace || key.delete) {
        setPromptInput((prev) => prev.slice(0, -1));
      } else if (inputChar) {
        setPromptInput((prev) => prev + inputChar);
      }
      return;
    }

    if (search.active) {
      if (key.return) {
        setSearch((s) => ({ ...s, active: false }));
        return;
      }
      if (key.escape) {
        setSearch((s) => ({ ...s, active: false, query: '', results: [] }));
        return;
      }
      if (key.upArrow) {
        setSearch((s) => ({ ...s, idx: Math.max(0, s.idx - 1) }));
        return;
      }
      if (key.downArrow) {
        setSearch((s) => ({ ...s, idx: Math.min(s.results.length - 1, s.idx + 1) }));
        return;
      }
      if (key.backspace || key.delete) {
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
      if (key.escape) {
        setMsgIdx(null);
        setMsgCursor(0);
        return;
      }
      if (key.return) {
        setMsgIdx(null);
        return;
      }
      if (key.upArrow) setMsgCursor((c) => Math.max(0, c - 1));
      else if (key.downArrow)
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
      if (key.return) {
        doEditMessage(msgEditing, editContent);
        setMsgEditing(null);
        setEditContent('');
        return;
      }
      if (key.escape) {
        setMsgEditing(null);
        setEditContent('');
        return;
      }
      if (key.backspace || key.delete) {
        setEditContent((prev) => prev.slice(0, -1));
      } else if (inputChar) {
        setEditContent((prev) => prev + inputChar);
      }
      return;
    }

    if (key.ctrl) {
      const ch = inputChar?.toLowerCase();
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

    if (key.escape) {
      setView('chat');
      return;
    }

    if (view === 'sidebar') {
      if (key.upArrow) setChatIdx((i) => Math.max(0, i - 1));
      else if (key.downArrow) setChatIdx((i) => Math.min(chats.length - 1, i + 1));
      else if (key.return) {
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
      if (key.upArrow) setModelIdx((i) => Math.max(0, i - 1));
      else if (key.downArrow) setModelIdx((i) => Math.min(names.length - 1, i + 1));
      else if (key.return) {
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

    if (key.return) {
      const text = input.trim();
      if (text.length === 0) return;
      setInput('');
      void sendMessage(text);
      return;
    }

    if (key.backspace || key.delete) {
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
      <Box flexDirection="column" height={rows}>
        <HelpOverlay />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={rows}>
      <Header manager={manager} view={view} isStreaming={isStreaming} />
      <Box flexDirection="row" flexGrow={1}>
        {view === 'sidebar' && (
          <Box flexDirection="column">
            <Sidebar chats={chats} activeId={session.id} selected={chatIdx} />
            {confirmDelete && (
              <Box
                borderStyle="single"
                borderColor="yellow"
                paddingX={1}
                width={34}
                marginTop={1}
              >
                <Text color="yellow">Delete selected conversation? (y/N)</Text>
              </Box>
            )}
            {renaming && (
              <Box
                borderStyle="single"
                borderColor="cyan"
                paddingX={1}
                width={34}
                marginTop={1}
              >
                <Text color="cyan">New title: </Text>
                {renameInput.length > 0 ? (
                  <>
                    <Text>{renameInput}</Text>
                    <Text inverse> </Text>
                  </>
                ) : (
                  <Text inverse> </Text>
                )}
              </Box>
            )}
            {tagging && (
              <Box
                borderStyle="single"
                borderColor="magenta"
                paddingX={1}
                width={34}
                marginTop={1}
              >
                <Text color="magenta">Tags (comma sep): </Text>
                {tagInput.length > 0 ? (
                  <>
                    <Text>{tagInput}</Text>
                    <Text inverse> </Text>
                  </>
                ) : (
                  <Text inverse> </Text>
                )}
              </Box>
            )}
            {promptEdit && (
              <Box
                borderStyle="single"
                borderColor="green"
                paddingX={1}
                width={34}
                marginTop={1}
              >
                <Text color="green">System prompt: </Text>
                {promptInput.length > 0 ? (
                  <>
                    <Text>{promptInput}</Text>
                    <Text inverse> </Text>
                  </>
                ) : (
                  <Text inverse> </Text>
                )}
              </Box>
            )}
          </Box>
        )}
        {view === 'settings' && (
          <Settings
            config={config}
            currentModel={manager.currentModel}
            selected={modelIdx}
          />
        )}
        <Box flexDirection="column" flexGrow={1}>
          {search.active && (
            <SearchBar query={search.query} count={search.results.length} />
          )}
          <Box
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
              <Box flexDirection="column" flexGrow={1}>
                <Layout
                  messages={messages}
                  streaming={streaming}
                  isStreaming={isStreaming}
                  error={error}
                  selectable={msgIdx !== null}
                  selected={msgCursor}
                />
              </Box>
            )}
          </Box>
          {msgIdx !== null && msgEditing === null && (
            <Box justifyContent="center" marginBottom={1}>
              <Box borderStyle="single" borderColor="yellow" paddingX={1}>
                <Text color="yellow">
                  Select: ↑/↓ · e edit · d delete · Enter/Esc done
                </Text>
              </Box>
            </Box>
          )}
          {msgEditing !== null && (
            <EditBar value={editContent} />
          )}
          <Box alignItems="center" flexDirection="column">
            {!search.active && msgIdx === null && msgEditing === null && (
              <InputBox value={input} isStreaming={isStreaming} />
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function WelcomeScreen() {
  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      flexGrow={1}
    >
      <Logo />
      <Text> </Text>
      <Text color="cyan" bold>
        Welcome to Silo
      </Text>
      <Text dimColor>
        A CLI chat app. Type a message to get started.
      </Text>
      <Text> </Text>
      <Box flexDirection="column" alignItems="flex-start">
        <Text>
          <Text color="yellow" bold>{'  Ctrl+T '.padEnd(14)}</Text>
          <Text dimColor>New chat</Text>
        </Text>
        <Text>
          <Text color="yellow" bold>{'  Ctrl+S '.padEnd(14)}</Text>
          <Text dimColor>Sidebar</Text>
        </Text>
        <Text>
          <Text color="yellow" bold>{'  Ctrl+G '.padEnd(14)}</Text>
          <Text dimColor>Settings</Text>
        </Text>
        <Text>
          <Text color="yellow" bold>{'  ?      '.padEnd(14)}</Text>
          <Text dimColor>All shortcuts</Text>
        </Text>
      </Box>
    </Box>
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
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <Box flexDirection="row" justifyContent="space-between" alignItems="center" width="100%">
        <Box flexDirection="row" alignItems="center">
          <Text color="cyan" bold>
            SILO
          </Text>
          <Text color="gray"> · </Text>
          <Text>{manager.label}</Text>
          {isStreaming && <Text color="green"> · typing…</Text>}
        </Box>
        <Box flexDirection="row" alignItems="center">
          <Text color={view === 'sidebar' ? 'cyan' : 'gray'} bold={view === 'sidebar'}>
            [≡] s
          </Text>
          <Text color="gray"> </Text>
          <Text
            color={view === 'settings' ? 'cyan' : 'gray'}
            bold={view === 'settings'}
          >
            [⚙] g
          </Text>
          <Text color="gray"> </Text>
          <Text color={view === 'chat' ? 'cyan' : 'gray'} bold={view === 'chat'}>
            [+] t
          </Text>
        </Box>
      </Box>
    </Box>
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
    <Box flexDirection="column" flexGrow={1} width="100%" paddingX={1}>
      {messages.map((msg, i) => (
        <MessageView
          key={msg.id}
          message={msg}
          selectable={selectable}
          selected={selectable && i === selected}
        />
      ))}
      {isStreaming && (
        <Box>
          <Text color="green" bold>
            Assistant:{' '}
          </Text>
          {streaming.length > 0 ? (
            <Text>{normalizeMessage(streaming)}</Text>
          ) : (
            <Text dimColor>waiting for response…</Text>
          )}
        </Box>
      )}
      {error && <Text color="red">{error}</Text>}
    </Box>
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
    <Box>
      <Text color={selected ? 'yellow' : color} bold inverse={selected}>
        {marker}{name}:{' '}
      </Text>
      {content.length > 0 ? (
        <Text inverse={selected}>{content}</Text>
      ) : (
        <Text dimColor>(no response)</Text>
      )}
    </Box>
  );
}

function SearchBar({ query, count }: { query: string; count: number }) {
  return (
    <Box borderStyle="single" borderColor="magenta" width="100%" paddingX={1} marginBottom={1}>
      <Text color="magenta" bold>
        Search:{' '}
      </Text>
      {query.length > 0 ? (
        <>
          <Text>{query}</Text>
          <Text inverse> </Text>
        </>
      ) : (
        <Text dimColor>Type to search current chat…</Text>
      )}
      <Text color="gray"> ({count} matches) · Enter/Esc done</Text>
    </Box>
  );
}

function SearchResults({
  results,
  selected,
}: {
  results: ChatMessage[];
  selected: number;
}) {
  if (results.length === 0) {
    return (
      <Box flexDirection="column" alignItems="center">
        <Text dimColor>No matching messages.</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" width="100%" paddingX={1}>
      {results.map((msg, i) => {
        const name = msg.role === 'user' ? 'You' : 'Assistant';
        const color = msg.role === 'user' ? 'cyan' : 'green';
        const content = normalizeMessage(msg.content);
        return (
          <Box key={msg.id}>
            <Text color={i === selected ? 'yellow' : color} bold inverse={i === selected}>
              {i === selected ? '» ' : '  '}{name}:{' '}
            </Text>
            <Text inverse={i === selected}>{content}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

function EditBar({ value }: { value: string }) {
  return (
    <Box borderStyle="single" borderColor="yellow" width="100%" paddingX={1} marginBottom={1}>
      <Text color="yellow" bold>
        Edit:{' '}
      </Text>
      {value.length > 0 ? (
        <>
          <Text>{value}</Text>
          <Text inverse> </Text>
        </>
      ) : (
        <Text inverse> </Text>
      )}
      <Text color="gray"> · Enter save · Esc cancel</Text>
    </Box>
  );
}

function InputBox({ value, isStreaming }: { value: string; isStreaming: boolean }) {
  return (
    <Box
      borderStyle="single"
      borderColor={isStreaming ? 'yellow' : 'gray'}
      width="50%"
      paddingX={1}
    >
      <Text color={isStreaming ? 'yellow' : 'cyan'}>
        {isStreaming ? '* ' : '> '}
      </Text>
      {value.length > 0 ? (
        <>
          <Text>{value}</Text>
          <Text inverse> </Text>
        </>
      ) : (
        <Text dimColor>Ask anything...</Text>
      )}
    </Box>
  );
}