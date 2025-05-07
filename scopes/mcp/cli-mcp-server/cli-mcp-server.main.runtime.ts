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

interface CommandFilterOptions {
  defaultTools: Set<string>;
  additionalCommandsSet?: Set<string>;
  userExcludeSet?: Set<string>;
  alwaysExcludeTools: Set<string>;
  extended: boolean;
  includeOnlySet?: Set<string>;
}

interface CommandConfig {
  name: string;
  description: string;
  argsData: ReturnType<typeof getArgsData>;
  flagsData: ReturnType<typeof getFlagsData>;
}

export class CliMcpServerMain {
  constructor(private cli: CLIMain, private logger: Logger){}

  private shouldIncludeCommand(cmdName: string, options: CommandFilterOptions): boolean {
    // Always exclude certain commands
    if (options.alwaysExcludeTools.has(cmdName)) return false;

    // User-specified exclude takes precedence
    if (options.userExcludeSet?.has(cmdName)) {
      this.logger.debug(`[MCP-DEBUG] Excluding command due to --exclude flag: ${cmdName}`);
      return false;
    }

    // If includeOnly is specified, only include those specific commands
    if (options.includeOnlySet) {
      const shouldInclude = options.includeOnlySet.has(cmdName);
      if (shouldInclude) {
        this.logger.debug(`[MCP-DEBUG] Including command due to --include-only flag: ${cmdName}`);
      }
      return shouldInclude;
    }

    // Extended mode includes all commands except excluded ones
    if (options.extended) return true;

    // Default mode: include default tools + any additional specified
    return options.defaultTools.has(cmdName) ||
           (options.additionalCommandsSet?.has(cmdName) ?? false);
  }

  private buildZodSchema(config: CommandConfig): Record<string, any> {
    const schema: Record<string, any> = {};

    config.argsData.forEach(arg => {
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

    config.flagsData.forEach(flag => {
      const type = flag.type;
      schema[flag.name] =
        type === 'string'
          ? z.string().optional().describe(flag.description)
          : z.boolean().optional().describe(flag.description);
    });

    return schema;
  }

  private buildCommandArgs(config: CommandConfig, params: any): string[] {
    const args: string[] = [config.name];

    // Add positional arguments in order
    config.argsData.forEach((arg) => {
      const val = params[arg.nameCamelCase];
      if (val === undefined) return;

      if (arg.isArray && Array.isArray(val)) {
        val.forEach(item => args.push(item));
      } else {
        args.push(val);
      }
    });

    // Add options as flags
    config.flagsData.forEach((flag) => {
      const name = flag.name;
      const type = flag.type;
      const val = params[name];
      if (val === undefined) return;
      if (type === 'boolean' && val) {
        args.push(`--${name}`);
      } else if (type === 'string' && val) {
        args.push(`--${name}`, val);
      }
    });

    return args;
  }

  private registerToolForCommand(server: McpServer, cmd: Command, parentCmd?: Command) {
    const cmdName = parentCmd
      ? `${getCommandName(parentCmd)} ${getCommandName(cmd)}`
      : getCommandName(cmd);

    // replace white spaces (\s) and dashes (-) with underscores (_)
    const toolName = `bit_${cmdName}`.replace(/[-\s]/g, '_');

    const config: CommandConfig = {
      name: cmdName,
      description: cmd.description,
      argsData: getArgsData(cmd),
      flagsData: getFlagsData(cmd)
    };

    const schema = this.buildZodSchema(config);

    server.tool(
      toolName,
      config.description,
      schema,
      async (params: any) => {
        const argsToRun = this.buildCommandArgs(config, params);
        return this.runBit(argsToRun);
      }
    );
  }

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

    const filterOptions: CommandFilterOptions = {
      defaultTools,
      additionalCommandsSet,
      userExcludeSet,
      alwaysExcludeTools,
      extended,
      includeOnlySet
    };

    commands.forEach((cmd) => {
      const cmdName = getCommandName(cmd);

      if (this.shouldIncludeCommand(cmdName, filterOptions)) {
        this.registerToolForCommand(server, cmd);
      }

      // Process sub-commands
      if (cmd.commands && cmd.commands.length) {
        this.processSubCommands(server, cmd, filterOptions);
      }
    });

    await server.connect(new StdioServerTransport());
  }

  private processSubCommands(
    server: McpServer,
    parentCmd: Command,
    options: CommandFilterOptions
  ) {
    const parentCmdName = getCommandName(parentCmd);

    parentCmd.commands?.forEach(subCmd => {
      const subCmdName = getCommandName(subCmd);
      const fullCmdName = `${parentCmdName} ${subCmdName}`;

      if (this.shouldIncludeCommand(fullCmdName, options)) {
        this.registerToolForCommand(server, subCmd, parentCmd);
      }
    });
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
