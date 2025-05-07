/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */

import CLIAspect, { CLIMain, getArgsData, getCommandName, getFlagsData, MainRuntime } from '@teambit/cli';
import execa from 'execa';
import { CliMcpServerAspect } from './cli-mcp-server.aspect';
import { McpServerCmd } from './mcp-server.cmd';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';

export class CliMcpServerMain {
  constructor(private cli: CLIMain, private logger: Logger){}

  async runBit(args: string[]): Promise<CallToolResult> {
    this.logger.debug(`[MCP-DEBUG] Running: bit ${args.join(' ')}`)
    try {
      const { stdout } = await execa('bit', args);
      return { content: [{ type: 'text', text: stdout.trim() }] };
    } catch (error: any) {
      return { content: [{ type: 'text', text: `Error running bit ${args[0]}: ${error}` }] };
    }
  }

  async registerTools(options: { extended?: boolean; }) {
    const commands = this.cli.commands;
    const extended = Boolean(options.extended);
    const defaultTools = new Set([
      'status', 'list', 'add', 'init', 'show', 'tag', 'snap', 'import', 'export', 'remove', 'log', 'test', 'diff',
      'install', 'lane show', 'lane create', 'lane switch', 'lane merge', 'create', 'templates', 'reset', 'checkout',
    ]);
    const server = new McpServer({
      name: 'bit-cli-mcp',
      version: '0.0.1',
    });
    for (const cmd of commands) {
      const cmdName = getCommandName(cmd);
      const toolName = cmdName;
      if (!extended && !defaultTools.has(cmdName)) continue;
      const argsData = getArgsData(cmd);

      // Build zod schema
      const schema: Record<string, any> = {};
      argsData.forEach(arg => {
        const desc = arg.description || `Positional argument: ${arg.nameRaw}`;
        if (arg.isArray) {
          schema[arg.nameCamelCase] = arg.required
            ? z.array(z.string()).describe(desc)
            : z.array(z.string()).optional().describe(desc);
        } else {
          schema[arg.nameCamelCase] = arg.required
            ? z.string().describe(desc)
            : z.string().optional().describe(desc);
        }
      });

      const flagsData = getFlagsData(cmd);
      flagsData.forEach(flag => {
        const type = flag.type;
        schema[flag.name] =
          type === 'string'
            ? z.string().optional().describe(flag.description)
            : z.boolean().optional().describe(flag.description);
      });

      server.tool(
        toolName,
        cmd.description,
        schema,
        async (params: any) => {
          const argsToRun: string[] = [cmdName];
          // Add positional arguments in order
          argsData.forEach((arg) => {
            const val = params[arg.nameCamelCase];
            if (val === undefined) return;

            if (arg.isArray && Array.isArray(val)) {
              // For array arguments, add each value separately
              val.forEach(item => argsToRun.push(item));
            } else {
              argsToRun.push(val);
            }
          });
          // Add options as flags
          flagsData.forEach((flag) => {
            const name = flag.name;
            const type = flag.type
            const val = params[name];
            if (val === undefined) return;
            if (type === 'boolean' && val) {
              argsToRun.push(`--${name}`);
            } else if (type === 'string' && val) {
              argsToRun.push(`--${name}`, val);
            }
          });

          return this.runBit(argsToRun);
        }
      );
    }
    await server.connect(new StdioServerTransport());
  }

  static slots = [];
  static dependencies = [CLIAspect, LoggerAspect];
  static runtime = MainRuntime;
  static async provider([cli, loggerMain]: [CLIMain, LoggerMain]) {
    const logger = loggerMain.createLogger(CliMcpServerAspect.id);
    const mcpServer = new CliMcpServerMain(cli, logger);
    cli.register(new McpServerCmd(mcpServer));
    return mcpServer;
  }
}

CliMcpServerAspect.addRuntime(CliMcpServerMain);

export default CliMcpServerMain;
