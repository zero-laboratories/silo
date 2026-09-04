import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.id === undefined) return;

  let result;
  switch (msg.method) {
    case 'initialize':
      result = {
        protocolVersion: '2024-11-05',
        capabilities: {},
        serverInfo: { name: 'fixture-mcp', version: '1.0.0' },
      };
      break;
    case 'tools/list':
      result = {
        tools: [
          {
            name: 'weather',
            description: 'Get the weather for a city',
            inputSchema: { type: 'object', properties: { city: { type: 'string' } } },
          },
          { name: 'ping', description: 'Ping the server' },
        ],
      };
      break;
    case 'tools/call': {
      const params = msg.params ?? {};
      if (params.name === 'echo') {
        result = {
          content: [{ type: 'text', text: `echo:${JSON.stringify(params.arguments ?? {})}` }],
        };
      } else if (params.name === 'boom') {
        result = { content: [{ type: 'text', text: 'something failed' }], isError: true };
      } else if (params.name === 'weather') {
        result = { content: [{ type: 'text', text: 'sunny, 24C' }] };
      } else {
        result = { content: [{ type: 'text', text: 'ok' }] };
      }
      break;
    }
    default:
      result = {};
  }

  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }) + '\n');
});