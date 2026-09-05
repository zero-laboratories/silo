import { spawn, type ChildProcess } from 'node:child_process';
import { Readable } from 'node:stream';
import type { McpServerConfig } from '../config/type.js';
import { SiloError } from '../error/index.js';
import type { ToolDefinition } from '../models/types.js';

const PROTOCOL_VERSION = '2024-11-05';
const REQUEST_TIMEOUT_MS = 30_000;

interface RpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

interface RpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface McpTool extends ToolDefinition {
  inputSchema?: unknown;
}

export interface McpCallResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

export class McpClient {
  readonly name: string;
  private child: ChildProcess | null = null;
  private input: Readable | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: RpcResponse) => void; reject: (e: Error) => void }>();
  private buf = '';
  private closed = false;
  private startError: string | null = null;

  constructor(name: string, private config: McpServerConfig) {
    this.name = name;
  }

  async connect(): Promise<void> {
    if (this.child) return;
    const { command, args = [], env = {} } = this.config;
    this.child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.input = this.child.stdout;

    this.child.on('error', (err) => {
      this.startError = err.message;
      void this.rejectPending(new SiloError(`MCP server "${this.name}" failed to start: ${err.message}`));
    });
    this.child.on('exit', (code) => {
      if (!this.startError) {
        this.startError = `exited unexpectedly (code ${code ?? 'null'})`;
      }
      void this.rejectPending(
        new SiloError(`MCP server "${this.name}" ${this.startError}.`),
      );
      this.child = null;
      this.input = null;
    });

    this.input?.setEncoding('utf8');
    this.input?.on('data', (chunk: string) => {
      this.buf += chunk;
      const lines = this.buf.split('\n');
      this.buf = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        this.handleMessage(trimmed);
      }
    });

    const init = await this.request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'silo', version: '0.0.0' },
    });
    const serverVersion = (init.result as { protocolVersion?: string } | undefined)?.protocolVersion;
    if (serverVersion !== undefined && !serverVersion.startsWith('2024-')) {
      throw new SiloError(
        `MCP server "${this.name}" uses unsupported protocol version "${serverVersion}".`,
      );
    }
    this.notify('notifications/initialized', {});
  }

  async listTools(): Promise<McpTool[]> {
    await this.ensureConnected();
    const res = await this.request('tools/list', {});
    const tools = (res.result as { tools?: McpTool[] } | undefined)?.tools ?? [];
    return tools;
  }

  async callTool(name: string, args: unknown): Promise<McpCallResult> {
    await this.ensureConnected();
    const res = await this.request('tools/call', { name, arguments: args });
    const result = res.result as McpCallResult;
    if (res.error) {
      throw new SiloError(`MCP tool "${this.name}/${name}" failed: ${res.error.message}`);
    }
    return result;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    void this.rejectPending(new SiloError(`MCP server "${this.name}" closed.`));
    const child = this.child;
    this.child = null;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    child.kill();
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 500);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private async ensureConnected(): Promise<void> {
    if (!this.child) await this.connect();
  }

  private request(method: string, params: unknown): Promise<RpcResponse> {
    if (!this.child) {
      return Promise.reject(
        new SiloError(this.startError ?? `MCP server "${this.name}" is not connected.`),
      );
    }
    if (this.child.exitCode !== null || this.child.signalCode !== null) {
      return Promise.reject(new SiloError(`MCP server "${this.name}" ${this.startError ?? 'exited unexpectedly'}.`));
    }
    const id = this.nextId++;
    const msg: RpcRequest = { jsonrpc: '2.0', id, method, params };
    return new Promise<RpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new SiloError(`MCP server "${this.name}" did not respond to "${method}" in time.`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: (res) => {
          clearTimeout(timer);
          resolve(res);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      let written = false;
      try {
        written = this.child?.stdin?.write(JSON.stringify(msg) + '\n') ?? false;
      } catch {
        written = false;
      }
      if (!written) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(
          new SiloError(
            this.startError
              ? `MCP server "${this.name}" failed to start: ${this.startError}`
              : `MCP server "${this.name}" failed to start or exited before answering.`,
          ),
        );
      }
    });
  }

  private notify(method: string, params: unknown): void {
    if (!this.child?.stdin?.writable) return;
    const msg = { jsonrpc: '2.0', method, params };
    this.child.stdin.write(JSON.stringify(msg) + '\n');
  }

  private handleMessage(line: string): void {
    let parsed: RpcResponse;
    try {
      parsed = JSON.parse(line) as RpcResponse;
    } catch {
      return; // Ignore non-JSON output on stdout.
    }
    if (typeof parsed.id !== 'number') return; // Not a response to our request.
    const pending = this.pending.get(parsed.id);
    if (!pending) return;
    this.pending.delete(parsed.id);
    if (parsed.error) {
      pending.reject(new SiloError(`${parsed.error.message}`));
    } else {
      pending.resolve(parsed);
    }
  }

  private async rejectPending(err: Error): Promise<void> {
    for (const [, p] of this.pending) p.reject(err);
    this.pending.clear();
  }
}