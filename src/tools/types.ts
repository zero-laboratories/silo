export interface BuiltinTool {
  namespace: string;
  name: string;
  description: string;
  inputSchema: unknown;
  run(args: unknown): Promise<string>;
}