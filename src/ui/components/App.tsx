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

  return (
    <Box flexDirection="column" height={rows}>
      {helpVisible && <HelpOverlay />}
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
          <Box
            flexDirection="column"
            flexGrow={1}
            justifyContent="flex-end"
            alignItems="center"
          >
            {messages.length === 0 && !isStreaming && !streaming && !error && (
              <WelcomeScreen />
            )}
            {(messages.length > 0 || isStreaming || streaming || error) && (
              <Box flexDirection="column" flexGrow={1}>
                <Layout
                  messages={messages}
                  streaming={streaming}
                  isStreaming={isStreaming}
                  error={error}
                />
              </Box>
            )}
          </Box>
          <Box alignItems="center" flexDirection="column">
            <InputBox value={input} isStreaming={isStreaming} />
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
}: {
  messages: ChatMessage[];
  streaming: string;
  isStreaming: boolean;
  error: string | null;
}) {
  return (
    <Box flexDirection="column" flexGrow={1} width="100%" paddingX={1}>
      {messages.map((msg) => (
        <MessageView key={msg.id} message={msg} />
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

function MessageView({ message }: { message: ChatMessage }) {
  const name = message.role === 'user' ? 'You' : 'Assistant';
  const color = message.role === 'user' ? 'cyan' : 'green';
  const content = normalizeMessage(message.content);
  return (
    <Box>
      <Text color={color} bold>
        {name}:{' '}
      </Text>
      {content.length > 0 ? (
        <Text>{content}</Text>
      ) : (
        <Text dimColor>(no response)</Text>
      )}
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