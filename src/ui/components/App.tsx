import React, { useRef, useState } from 'react';
import { Box, Text, useInput, useWindowSize } from 'ink';
import { Logo } from './Logo.js';
import type { ChatManager } from '../../chat/session.js';
import type { ChatMessage } from '../../chat/types.js';

interface AppProps {
  manager: ChatManager;
}

export function App({ manager }: AppProps) {
  const { rows } = useWindowSize();
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = manager.session;
  const [messages, setMessages] = useState<ChatMessage[]>(session.messages);
  const abortRef = useRef<AbortController | null>(null);

  useInput((inputChar, key) => {
    if (isStreaming) {
      if (key.ctrl) {
        abortRef.current?.abort();
        setIsStreaming(false);
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
      for await (const chunk of manager.send(text)) {
        if (chunk.type === 'content' && chunk.content) {
          setStreaming((prev) => prev + (chunk.content ?? ''));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsStreaming(false);
      setStreaming('');
      setMessages(manager.session.messages);
    }
  }

  const hasChat = messages.length > 0 || error !== null;

  return (
    <Box flexDirection="column" height={rows}>
      {hasChat && (
        <Box borderStyle="single" borderColor="gray" paddingX={1}>
          <Text color="cyan" bold>SILO</Text>
          <Text color="gray"> · </Text>
          <Text>{manager.label}</Text>
          {isStreaming && <Text color="green"> · typing…</Text>}
        </Box>
      )}
      <Box flexDirection="column" flexGrow={1} justifyContent="flex-end" alignItems="center">
        {messages.length === 0 && !isStreaming && !streaming && !error && (
          <Box
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            flexGrow={1}
          >
            <Logo />
            <Text> </Text>
          </Box>
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
      {isStreaming && <Text color="green" bold>Assistant: {streaming}</Text>}
      {error && <Text color="red">{error}</Text>}
    </Box>
  );
}

function MessageView({ message }: { message: ChatMessage }) {
  const name = message.role === 'user' ? 'You' : 'Assistant';
  const color = message.role === 'user' ? 'cyan' : 'green';
  return (
    <Box>
      <Text color={color} bold>{name}: </Text>
      <Text>{message.content}</Text>
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
      <Text color={isStreaming ? 'yellow' : 'cyan'}>{isStreaming ? '* ' : '> '}</Text>
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
