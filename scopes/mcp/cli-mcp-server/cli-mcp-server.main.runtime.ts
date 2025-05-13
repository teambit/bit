/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */

import { CLIAspect, CLIMain, Command, getArgsData, getCommandName, getFlagsData, MainRuntime } from '@teambit/cli';
import childProcess from 'child_process';
import { CliMcpServerAspect } from './cli-mcp-server.aspect';
import { McpServerCmd } from './mcp-server.cmd';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { Http } from '@teambit/scope.network';
import { CENTRAL_BIT_HUB_NAME, SYMPHONY_GRAPHQL } from '@teambit/legacy.constants';

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
  private bitBin = 'bit';
  private _http: Http;
  constructor(
    private cli: CLIMain,
    private logger: Logger
  ) {}

  async getHttp(): Promise<Http> {
    if (!this._http) {
      this._http = await Http.connect(SYMPHONY_GRAPHQL, CENTRAL_BIT_HUB_NAME);
    }
    return this._http;
  }

  async runMcpServer(options: {
    extended?: boolean;
    includeOnly?: string;
    includeAdditional?: string;
    exclude?: string;
    bitBin?: string;
  }) {
    this.logger.debug(`[MCP-DEBUG] Starting MCP server with options: ${JSON.stringify(options)}`);
    const commands = this.cli.commands;
    const extended = Boolean(options.extended);
    this.bitBin = options.bitBin || this.bitBin;
    // Default set of tools to include
    const defaultTools = new Set([
      'status',
      'list',
      'add',
      'init',
      'show',
      'tag',
      'snap',
      'import',
      'export',
      'remove',
      'log',
      'test',
      'diff',
      'install',
      'lane show',
      'lane create',
      'lane switch',
      'lane merge',
      'create',
      'templates',
      'reset',
      'checkout',
      'remote-search',
    ]);

    // Tools to always exclude
    const alwaysExcludeTools = new Set([
      'login',
      'logout',
      'completion',
      'mcp-server',
      'start',
      'run-action',
      'watch',
      'run',
      'resume-export',
      'server',
      'serve-preview',
    ]);

    // Parse command strings from flag options
    let includeOnlySet: Set<string> | undefined;
    if (options.includeOnly) {
      includeOnlySet = new Set(options.includeOnly.split(',').map((cmd) => cmd.trim()));
      this.logger.debug(`[MCP-DEBUG] Including only commands: ${Array.from(includeOnlySet).join(', ')}`);
    }

    let additionalCommandsSet: Set<string> | undefined;
    if (options.includeAdditional) {
      additionalCommandsSet = new Set(options.includeAdditional.split(',').map((cmd) => cmd.trim()));
      this.logger.debug(`[MCP-DEBUG] Including additional commands: ${Array.from(additionalCommandsSet).join(', ')}`);
    }

    let userExcludeSet: Set<string> | undefined;
    if (options.exclude) {
      userExcludeSet = new Set(options.exclude.split(',').map((cmd) => cmd.trim()));
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
      includeOnlySet,
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

    this.registerRemoteSearchTool(server);
    this.registerGetSchemaTool(server);

    await server.connect(new StdioServerTransport());
  }

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
    return options.defaultTools.has(cmdName) || (options.additionalCommandsSet?.has(cmdName) ?? false);
  }

  private buildZodSchema(config: CommandConfig): Record<string, any> {
    const schema: Record<string, any> = {
      // Add cwd parameter as mandatory to all commands
      cwd: z.string().describe('Path to workspace'),
    };

    config.argsData.forEach((arg) => {
      const desc = arg.description || `Positional argument: ${arg.nameRaw}`;
      if (arg.isArray) {
        schema[arg.nameCamelCase] = arg.required
          ? z.array(z.string()).describe(desc)
          : z.array(z.string()).optional().describe(desc);
      } else {
        schema[arg.nameCamelCase] = arg.required ? z.string().describe(desc) : z.string().optional().describe(desc);
      }
    });

    config.flagsData.forEach((flag) => {
      const type = flag.type;
      schema[flag.name] =
        type === 'string'
          ? z.string().optional().describe(flag.description)
          : z.boolean().optional().describe(flag.description);
    });

    return schema;
  }

  private buildCommandArgs(config: CommandConfig, params: any): string[] {
    // Split the command name on spaces to properly handle subcommands
    const args: string[] = config.name.split(' ');

    // Add positional arguments in order
    config.argsData.forEach((arg) => {
      const val = params[arg.nameCamelCase];
      if (val === undefined) return;

      if (arg.isArray && Array.isArray(val)) {
        val.forEach((item) => args.push(item));
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
        // Check if the string value contains spaces and quote it if necessary
        const stringValue = String(val);
        if (stringValue.includes(' ')) {
          args.push(`--${name}`, `"${stringValue}"`);
        } else {
          args.push(`--${name}`, stringValue);
        }
      }
    });

    return args;
  }

  private getToolName(name: string): string {
    // replace white spaces (\s) and dashes (-) with underscores (_)
    return `bit_${name}`.replace(/[-\s]/g, '_');
  }

  private registerToolForCommand(server: McpServer, cmd: Command, parentCmd?: Command) {
    const cmdName = parentCmd ? `${getCommandName(parentCmd)} ${getCommandName(cmd)}` : getCommandName(cmd);
    const toolName = this.getToolName(cmdName);
    const description = `${cmd.description}${cmd.extendedDescription ? `.\n(${cmd.extendedDescription})` : ''}`;
    const config: CommandConfig = {
      name: cmdName,
      description,
      argsData: getArgsData(cmd),
      flagsData: getFlagsData(cmd),
    };

    const schema = this.buildZodSchema(config);

    server.tool(toolName, config.description, schema, async (params: any) => {
      const argsToRun = this.buildCommandArgs(config, params);
      return this.runBit(argsToRun, params.cwd);
    });
  }

  private registerRemoteSearchTool(server: McpServer) {
    const toolName = this.getToolName('remote-search');
    const description = 'Search for components in remote scopes';
    const schema: Record<string, any> = {
      queryStr: z.string().describe('Search query string'),
    };
    server.tool(toolName, description, schema, async (params: any) => {
      const http = await this.getHttp();
      const results = await http.search(params.queryStr);
      this.logger.debug(`[MCP-DEBUG] Search results: ${JSON.stringify(results)}`);
      if (!results?.components || results.components.length === 0) {
        return { content: [{ type: 'text', text: 'No results found' }] };
      }
      const formattedResults = results.components.map((result) => ({
        type: 'text',
        text: result,
      }));
      return { content: formattedResults } as CallToolResult;
    });
  }

  private registerGetSchemaTool(server: McpServer) {
    const toolName = this.getToolName('remote-get-schema');
    const description = 'Get the schema of a component from the remote scope. (the schema is the API of the component)';
    const schema: Record<string, any> = {
      id: z.string().describe('Component ID'),
    };
    server.tool(toolName, description, schema, async (params: any) => {
      const http = await this.getHttp();
      const response = await http.getSchema(params.id);
      return { content: [{ type: 'text', text: JSON.stringify(response) }] } as CallToolResult;
    });
  }

  private processSubCommands(server: McpServer, parentCmd: Command, options: CommandFilterOptions) {
    const parentCmdName = getCommandName(parentCmd);

    parentCmd.commands?.forEach((subCmd) => {
      const subCmdName = getCommandName(subCmd);
      const fullCmdName = `${parentCmdName} ${subCmdName}`;

      if (this.shouldIncludeCommand(fullCmdName, options)) {
        this.registerToolForCommand(server, subCmd, parentCmd);
      }
    });
  }

  private async runBit(args: string[], cwd: string): Promise<CallToolResult> {
    this.logger.debug(`[MCP-DEBUG] Running: ${this.bitBin} ${args.join(' ')} in ${cwd}`);
    const cmd = `${this.bitBin} ${args.join(' ')}`;
    try {
      const cmdOutput = childProcess.execSync(cmd, { cwd });
      this.logger.debug(`[MCP-DEBUG] result. stdout: ${cmdOutput}`);

      return { content: [{ type: 'text', text: cmdOutput.toString() }] };
    } catch (error: any) {
      this.logger.error(`[MCP-DEBUG] Error executing ${cmd}`, error);

      return { content: [{ type: 'text', text: error.message }] };
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
