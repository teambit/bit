import { CLIArgs, Command, CommandOptions, Flags } from '@teambit/cli';
import { Logger } from '@teambit/logger';
import { CliMcpServerMain } from './cli-mcp-server.main.runtime';

export class McpServerCmd implements Command {
  name = 'mcp-server';
  description = 'Start the Bit CLI Model Context Protocol (MCP) server for programmatic and remote access to Bit commands.';
  alias = '';
  group = 'development';
  options = [
    ['e', 'extended', 'Enable the full set of Bit CLI commands as MCP tools'],
    ['d', 'debug', 'Enable debug logging for the MCP server'],
  ] as CommandOptions;

  constructor(
    private mcpServer: CliMcpServerMain
  ) {}

  async wait(args: CLIArgs, flags: Flags): Promise<void> {
    await this.mcpServer.registerTools(flags);
  }
}
