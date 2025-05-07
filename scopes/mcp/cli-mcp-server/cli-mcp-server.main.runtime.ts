/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */


import CLIAspect, { CLIMain, Command, getArgsData, getCommandName, getFlagsData, MainRuntime } from '@teambit/cli';
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

  async runMcpServer(options: {
    extended?: boolean;
    includeOnly?: string;
    includeAdditional?: string;
    exclude?: string;
  }) {
    const commands = this.cli.commands;
    const extended = Boolean(options.extended);

    // Default set of tools to include
    const defaultTools = new Set([
      'status', 'list', 'add', 'init', 'show', 'tag', 'snap', 'import', 'export', 'remove', 'log', 'test', 'diff',
      'install', 'lane show', 'lane create', 'lane switch', 'lane merge', 'create', 'templates', 'reset', 'checkout',
    ]);

    // Tools to always exclude
    const alwaysExcludeTools = new Set([
      'login', 'logout', 'completion', 'mcp-server', 'start', 'run-action', 'watch', 'run', 'resume-export',
      'server', 'serve-preview'
    ]);

    // Parse command strings from flag options
    let includeOnlySet: Set<string> | undefined;
    if (options.includeOnly) {
      includeOnlySet = new Set(
        options.includeOnly.split(',').map(cmd => cmd.trim())
      );
      this.logger.debug(`[MCP-DEBUG] Including only commands: ${Array.from(includeOnlySet).join(', ')}`);
    }

    let additionalCommandsSet: Set<string> | undefined;
    if (options.includeAdditional) {
      additionalCommandsSet = new Set(
        options.includeAdditional.split(',').map(cmd => cmd.trim())
      );
      this.logger.debug(`[MCP-DEBUG] Including additional commands: ${Array.from(additionalCommandsSet).join(', ')}`);
    }

    let userExcludeSet: Set<string> | undefined;
    if (options.exclude) {
      userExcludeSet = new Set(
        options.exclude.split(',').map(cmd => cmd.trim())
      );
      this.logger.debug(`[MCP-DEBUG] Excluding commands: ${Array.from(userExcludeSet).join(', ')}`);
    }

    const server = new McpServer({
      name: 'bit-cli-mcp',
      version: '0.0.1',
    });

    commands.forEach((cmd) => {
      const cmdName = getCommandName(cmd);

      // Always exclude certain commands
      if (alwaysExcludeTools.has(cmdName)) return;

      // User-specified exclude takes precedence
      if (userExcludeSet && userExcludeSet.has(cmdName)) {
        this.logger.debug(`[MCP-DEBUG] Excluding command due to --exclude flag: ${cmdName}`);
        return;
      }

      // If includeOnly is specified, only include those specific commands
      if (includeOnlySet) {
        if (includeOnlySet.has(cmdName)) {
          this.logger.debug(`[MCP-DEBUG] Including command due to --include-only flag: ${cmdName}`);
          this.registerTool(server, cmd);
        }
        return;
      }

      // Extended mode includes all commands except excluded ones
      if (extended) {
        this.registerTool(server, cmd);
        return;
      }

      // Default mode: include default tools + any additional specified
      if (defaultTools.has(cmdName) || (additionalCommandsSet && additionalCommandsSet.has(cmdName))) {
        this.registerTool(server, cmd);
      }

      // Process sub-commands
      if (cmd.commands && cmd.commands.length) {
        this.processSubCommands(server, cmd, {
          defaultTools,
          additionalCommandsSet,
          userExcludeSet,
          alwaysExcludeTools,
          extended,
          includeOnlySet
        });
      }
    });

    await server.connect(new StdioServerTransport());
  }

  private processSubCommands(
    server: McpServer,
    parentCmd: Command,
    options: {
      defaultTools: Set<string>,
      additionalCommandsSet?: Set<string>,
      userExcludeSet?: Set<string>,
      alwaysExcludeTools: Set<string>,
      extended: boolean,
      includeOnlySet?: Set<string>
    }
  ) {
    const parentCmdName = getCommandName(parentCmd);

    parentCmd.commands?.forEach(subCmd => {
      const subCmdName = getCommandName(subCmd);
      const fullCmdName = `${parentCmdName} ${subCmdName}`;

      // Always exclude certain commands
      if (options.alwaysExcludeTools.has(fullCmdName)) return;

      // User-specified exclude takes precedence
      if (options.userExcludeSet && options.userExcludeSet.has(fullCmdName)) {
        this.logger.debug(`[MCP-DEBUG] Excluding sub-command due to --exclude flag: ${fullCmdName}`);
        return;
      }

      // If includeOnly is specified, only include those specific commands
      if (options.includeOnlySet) {
        if (options.includeOnlySet.has(fullCmdName)) {
          this.logger.debug(`[MCP-DEBUG] Including sub-command due to --include-only flag: ${fullCmdName}`);
          this.registerSubCommandTool(server, parentCmd, subCmd);
        }
        return;
      }

      // Extended mode includes all commands except excluded ones
      if (options.extended) {
        this.registerSubCommandTool(server, parentCmd, subCmd);
        return;
      }

      // Default mode: include default tools + any additional specified
      if (options.defaultTools.has(fullCmdName) ||
          (options.additionalCommandsSet && options.additionalCommandsSet.has(fullCmdName))) {
        this.registerSubCommandTool(server, parentCmd, subCmd);
      }
    });
  }

  private registerSubCommandTool(server: McpServer, parentCmd: Command, subCmd: Command) {
    const parentCmdName = getCommandName(parentCmd);
    const subCmdName = getCommandName(subCmd);
    const fullCmdName = `${parentCmdName} ${subCmdName}`;

    const argsData = getArgsData(subCmd);
    const flagsData = getFlagsData(subCmd);

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

    flagsData.forEach(flag => {
      const type = flag.type;
      schema[flag.name] =
        type === 'string'
          ? z.string().optional().describe(flag.description)
          : z.boolean().optional().describe(flag.description);
    });

    const toolName = `bit_${parentCmdName}_${subCmdName}`.replace(/-/g, '_');

    this.logger.debug(`[MCP-DEBUG] Registering sub-command MCP tool: ${fullCmdName} as ${toolName}`);

    server.tool(
      toolName,
      subCmd.description,
      schema,
      async (params: any) => {
        const argsToRun: string[] = [parentCmdName, subCmdName];

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
          const type = flag.type;
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

  private registerTool(server: McpServer, cmd: Command) {
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
    const cmdName = getCommandName(cmd);
    const toolName = `bit_${cmdName}`.replace(/-/g, '_');

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

  private async runBit(args: string[]): Promise<CallToolResult> {
    this.logger.debug(`[MCP-DEBUG] Running: bit ${args.join(' ')}`)
    try {
      const { stdout } = await execa('bit', args);
      return { content: [{ type: 'text', text: stdout.trim() }] };
    } catch (error: any) {
      return { content: [{ type: 'text', text: `Error running bit ${args[0]}: ${error}` }] };
    }
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
