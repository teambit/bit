/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */

import { CLIAspect, CLIMain, Command, getArgsData, getCommandName, getFlagsData, MainRuntime } from '@teambit/cli';
import childProcess from 'child_process';
import { CliMcpServerAspect } from './cli-mcp-server.aspect';
import { McpServerCmd, McpStartCmd } from './mcp-server.cmd';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { Http } from '@teambit/scope.network';
import { CENTRAL_BIT_HUB_NAME, SYMPHONY_GRAPHQL } from '@teambit/legacy.constants';
import fetch from 'node-fetch';
import { McpSetupCmd } from './setup-cmd';

interface CommandFilterOptions {
  defaultTools: Set<string>;
  additionalCommandsSet?: Set<string>;
  userExcludeSet?: Set<string>;
  alwaysExcludeTools: Set<string>;
  extended: boolean;
  includeOnlySet?: Set<string>;
  consumerProject: boolean;
  consumerProjectTools: Set<string>;
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
  private isConsumerProjectMode: boolean = false;
  private serverPort?: number;
  private serverUrl?: string;
  private serverProcess: childProcess.ChildProcess | null = null;

  // Whitelist of commands that are considered read-only/query operations
  private readonly readOnlyCommands = new Set([
    'status',
    'list',
    'info',
    'show',
    'schema',
    'artifacts',
    'diff',
    'log',
    'graph',
    'deps get',
    'deps blame',
    'why',
    'config get',
    'envs list',
    'envs get',
    'remote list',
    'templates',
    'cat-component',
    'cat-lane',
    'cat-object',
    'cat-scope',
    'lane show',
    'lane list',
    'lane diff',
    'lane history',
    'lane history-diff',
    'test',
    'help',
    'version',
  ]);

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

  private async getBitServerPort(cwd: string, skipValidatePortFlag = false): Promise<number | undefined> {
    try {
      const existingPort = childProcess
        .execSync(`${this.bitBin} cli-server-port ${skipValidatePortFlag}`, {
          cwd,
          env: { ...process.env, BIT_CLI_SERVER: 'true' },
        })
        .toString()
        .trim();
      if (!existingPort) return undefined;
      return parseInt(existingPort, 10);
    } catch (err: any) {
      this.logger.error(`[MCP-DEBUG] error getting existing port from bit server at ${cwd}. err: ${err.message}`);
      return undefined;
    }
  }

  /**
   * Start a new bit-server process
   */
  private async startBitServer(cwd: string): Promise<number | null> {
    this.logger.debug('[MCP-DEBUG] Starting new bit-server process');

    return new Promise((resolve, reject) => {
      try {
        const serverProcess = childProcess.spawn(this.bitBin, ['server'], {
          cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: false,
        });

        this.serverProcess = serverProcess;

        let serverStarted = false;
        let outputBuffer = '';

        const timeout = setTimeout(() => {
          if (!serverStarted) {
            this.logger.error('[MCP-DEBUG] Timeout waiting for bit-server to start');
            serverProcess.kill();
            resolve(null);
          }
        }, 30000); // 30 second timeout

        serverProcess.stdout?.on('data', (data) => {
          const output = data.toString();
          outputBuffer += output;
          this.logger.debug(`[MCP-DEBUG] bit-server stdout: ${output}`);
          if (output.includes('listening on port')) {
            clearTimeout(timeout);
            if (!serverStarted) {
              serverStarted = true;
              // Extract the port from the output
              const portMatch = output.match(/listening on port (\d+)/);
              if (portMatch && portMatch[1]) {
                const port = parseInt(portMatch[1], 10);
                this.logger.debug(`[MCP-DEBUG] bit-server started on port ${port}`);
                this.serverPort = port;
                this.serverUrl = `http://localhost:${port}/api`;
                resolve(port);
              }
            }
          }
        });

        serverProcess.stderr?.on('data', (data) => {
          const error = data.toString();
          outputBuffer += error;
          this.logger.debug(`[MCP-DEBUG] bit-server stderr: ${error}`);
        });

        serverProcess.on('error', (err) => {
          clearTimeout(timeout);
          this.logger.error(`[MCP-DEBUG] Failed to start bit-server: ${err.message}`);
          reject(err);
        });

        serverProcess.on('exit', (code, signal) => {
          clearTimeout(timeout);
          if (!serverStarted) {
            this.logger.error(`[MCP-DEBUG] bit-server exited with code ${code}, signal ${signal}`);
            this.logger.debug(`[MCP-DEBUG] bit-server output: ${outputBuffer}`);
            resolve(null);
          }
        });

        const killServerProcess = () => {
          if (this.serverProcess && !this.serverProcess.killed) {
            this.logger.debug('[MCP-DEBUG] Killing bit-server process');
            this.serverProcess.kill();
          }
        };

        // Handle process cleanup
        process.on('exit', () => {
          killServerProcess();
        });

        process.on('SIGINT', () => {
          killServerProcess();
          process.exit();
        });

        process.on('SIGTERM', () => {
          killServerProcess();
          process.exit();
        });
      } catch (err) {
        this.logger.error(`[MCP-DEBUG] Error spawning bit-server: ${(err as Error).message}`);
        reject(err);
      }
    });
  }

  /**
   * Call bit-server API endpoint using cli-raw route
   */
  private async callBitServerAPI(
    command: string,
    args: string[] = [],
    flags: Record<string, any> = {},
    cwd: string,
    isReTrying = false
  ): Promise<any> {
    return this.callBitServerAPIWithRoute('cli-raw', command, args, flags, cwd, isReTrying);
  }

  /**
   * Call bit-server API endpoint using IDE route
   */
  private async callBitServerIDEAPI(method: string, args: any[] = [], cwd: string, isReTrying = false): Promise<any> {
    return this.callBitServerAPIWithRoute('ide', method, args, {}, cwd, isReTrying, true);
  }

  /**
   * Generic method to call bit-server API with different routes
   */
  private async callBitServerAPIWithRoute(
    route: string,
    commandOrMethod: string,
    argsOrParams: any[] = [],
    flags: Record<string, any> = {},
    cwd: string,
    isReTrying = false,
    isIDERoute = false
  ): Promise<any> {
    if (!this.serverPort) {
      if (!cwd) throw new Error('CWD is required to call bit-server API');
      this.serverPort = await this.getBitServerPort(cwd);
      if (this.serverPort) {
        this.serverUrl = `http://localhost:${this.serverPort}/api`;
      } else {
        // No server running, try to start one
        this.logger.debug('[MCP-DEBUG] No bit-server found, attempting to start one');
        const startedPort = await this.startBitServer(cwd);
        if (startedPort) {
          this.serverPort = startedPort;
          this.serverUrl = `http://localhost:${this.serverPort}/api`;
        }
      }
    }

    if (!this.serverUrl) {
      throw new Error('Unable to connect to bit-server. Please ensure you are in a valid Bit workspace.');
    }

    // Resolve the real path to handle symlinks (e.g., /tmp -> /private/tmp on macOS)
    const fs = require('fs');
    const realCwd = fs.realpathSync(cwd);

    let body: any;
    let url: string;

    if (isIDERoute) {
      // For IDE route, use the method name and args directly
      body = {
        args: argsOrParams,
      };
      url = `${this.serverUrl}/${route}/${commandOrMethod}`;
    } else {
      // For CLI route, build command array with flags
      const commandArray = [commandOrMethod, ...argsOrParams];

      // Convert flags to command line arguments
      for (const [key, value] of Object.entries(flags)) {
        if (value === true) {
          commandArray.push(`--${key}`);
        } else if (value !== false && value !== undefined) {
          commandArray.push(`--${key}`, String(value));
        }
      }

      body = {
        command: commandArray,
        pwd: realCwd,
      };
      url = `${this.serverUrl}/${route}`;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorJson = await response.json();
          errorMessage = errorJson.message || errorMessage;
        } catch {
          // Ignore JSON parse errors
        }
        throw new Error(errorMessage);
      }

      return await response.json();
    } catch (err: any) {
      if (err.code === 'ECONNREFUSED' && !isReTrying) {
        // Server is no longer running, reset cached values and try to restart
        this.serverPort = undefined;
        this.serverUrl = undefined;
        this.logger.debug('[MCP-DEBUG] Connection refused, attempting to restart bit-server');
        return this.callBitServerAPIWithRoute(route, commandOrMethod, argsOrParams, flags, cwd, true, isIDERoute);
      }
      throw err;
    }
  }

  async runMcpServer(options: {
    extended?: boolean;
    includeOnly?: string;
    includeAdditional?: string;
    exclude?: string;
    bitBin?: string;
    consumerProject?: boolean;
  }) {
    this.logger.debug(`[MCP-DEBUG] Starting MCP server with options: ${JSON.stringify(options)}`);
    const commands = this.cli.commands;
    const extended = Boolean(options.extended);
    this.bitBin = options.bitBin || this.bitBin;
    // Default set of tools to include
    const defaultTools = new Set(['create', 'schema', 'remote-search']);

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

    // Set of tools for consumer projects (non-Bit workspaces)
    const consumerProjectTools = new Set(['schema', 'show', 'remote-search']);

    const consumerProject = Boolean(options.consumerProject);

    // Store consumer project mode globally in the class
    this.isConsumerProjectMode = consumerProject;

    // Validate flags combination
    if (consumerProject) {
      this.logger.debug(
        `[MCP-DEBUG] Running MCP server in consumer project mode (for non-Bit workspaces) with tools: ${Array.from(consumerProjectTools).join(', ')}`
      );
      if (options.includeAdditional) {
        this.logger.debug(
          `[MCP-DEBUG] Additional tools enabled in consumer project mode: ${options.includeAdditional}`
        );
      }
      if (extended) {
        this.logger.warn(
          '[MCP-DEBUG] Warning: --consumer-project and --extended flags were both provided. The --extended flag will be ignored.'
        );
      }
    }

    const filterOptions: CommandFilterOptions = {
      defaultTools,
      additionalCommandsSet,
      userExcludeSet,
      alwaysExcludeTools,
      extended: consumerProject ? false : extended, // Ignore extended when consumerProject is true
      includeOnlySet,
      consumerProject,
      consumerProjectTools,
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

    const remoteCommands = ['remote-search'];
    remoteCommands.forEach((cmdName) => {
      if (this.shouldIncludeCommand(cmdName, filterOptions)) {
        this.registerToolForRemote(server, cmdName);
      }
    });

    // Register the bit_workspace_info tool
    this.registerWorkspaceInfoTool(server);

    // Register the bit_component_details tool
    this.registerComponentDetailsTool(server);

    // Register the bit_commands_info tool
    this.registerCommandsInfoTool(server);

    // Register arbitrary command execution tools
    this.registerQueryTool(server);
    this.registerExecuteTool(server);

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

    // Consumer project mode: only include consumer project tools + any additional specified
    if (options.consumerProject) {
      const shouldInclude =
        options.consumerProjectTools.has(cmdName) || (options.additionalCommandsSet?.has(cmdName) ?? false);
      if (shouldInclude) {
        this.logger.debug(`[MCP-DEBUG] Including command in consumer project mode: ${cmdName}`);
      }
      return shouldInclude;
    }

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

    // Modify description for show and schema commands in consumer project mode
    let description = `${cmd.description}${cmd.extendedDescription ? `.\n(${cmd.extendedDescription})` : ''}`;
    if (this.isConsumerProjectMode && (cmdName === 'show' || cmdName === 'schema')) {
      description += `\n(In consumer project mode, --remote flag is automatically added)`;
    }

    const config: CommandConfig = {
      name: cmdName,
      description,
      argsData: getArgsData(cmd),
      flagsData: getFlagsData(cmd),
    };

    const schema = this.buildZodSchema(config);

    server.tool(toolName, config.description, schema, async (params: any) => {
      const argsToRun = this.buildCommandArgs(config, params);

      // Special handling for consumer projects - auto-add --remote flag for show and schema commands
      if (this.isConsumerProjectMode && (cmdName === 'show' || cmdName === 'schema')) {
        if (!argsToRun.includes('--remote')) {
          this.logger.debug(`[MCP-DEBUG] Auto-adding --remote flag for ${cmdName} in consumer project mode`);
          argsToRun.push('--remote');
        }
        if (cmdName === 'show' && !argsToRun.includes('--legacy')) {
          this.logger.debug(`[MCP-DEBUG] Auto-adding --legacy flag for ${cmdName} in consumer project mode`);
          argsToRun.push('--legacy');
        }
      }

      return this.runBit(argsToRun, params.cwd);
    });
  }

  private registerToolForRemote(server: McpServer, name: string) {
    if (name === 'remote-search') {
      this.registerRemoteSearchTool(server);
    }
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

  private registerWorkspaceInfoTool(server: McpServer) {
    const toolName = 'bit_workspace_info';
    const description =
      'Get comprehensive workspace information including status, components list, apps, templates, and dependency graph';
    const schema: Record<string, any> = {
      cwd: z.string().describe('Path to workspace directory'),
      includeStatus: z.boolean().optional().describe('Include workspace status (default: true)'),
      includeList: z.boolean().optional().describe('Include components list (default: true)'),
      includeApps: z.boolean().optional().describe('Include apps list (default: false)'),
      includeTemplates: z.boolean().optional().describe('Include templates list (default: false)'),
      includeGraph: z.boolean().optional().describe('Include dependency graph (default: false)'),
    };

    server.tool(toolName, description, schema, async (params: any) => {
      try {
        const includeStatus = params.includeStatus !== false; // Default to true
        const includeList = params.includeList !== false; // Default to true
        const includeApps = params.includeApps === true;
        const includeTemplates = params.includeTemplates === true;
        const includeGraph = params.includeGraph === true;

        const workspaceInfo: any = {};

        // Get workspace status using bit-server API with error handling
        if (includeStatus) {
          const statusExecution = await this.safeBitCommandExecution(
            'status',
            [],
            { json: true },
            params.cwd,
            'get workspace status',
            true
          );
          workspaceInfo.status = statusExecution.result;
        }

        // Get components list if requested
        if (includeList) {
          const listExecution = await this.safeBitCommandExecution(
            'list',
            [],
            { json: true },
            params.cwd,
            'get components list',
            true
          );
          workspaceInfo.list = listExecution.result;
        }

        // Get apps list if requested
        if (includeApps) {
          const appsExecution = await this.safeBitCommandExecution(
            'app',
            ['list'],
            { json: true },
            params.cwd,
            'get apps list',
            true
          );
          workspaceInfo.apps = appsExecution.result;
        }

        // Get templates list if requested
        if (includeTemplates) {
          const templatesExecution = await this.safeBitCommandExecution(
            'templates',
            [],
            { json: true },
            params.cwd,
            'get templates list',
            true
          );
          workspaceInfo.templates = templatesExecution.result;
        }

        // Get dependency graph if requested
        if (includeGraph) {
          const graphExecution = await this.safeBitCommandExecution(
            'graph',
            [],
            { json: true },
            params.cwd,
            'get dependency graph',
            true
          );
          workspaceInfo.graph = graphExecution.result;
        }

        return this.formatAsCallToolResult(workspaceInfo);
      } catch (error) {
        this.logger.error(`[MCP-DEBUG] Error in bit_workspace_info tool: ${(error as Error).message}`);
        return this.formatErrorAsCallToolResult(error as Error, 'getting workspace info');
      }
    });
  }

  private registerComponentDetailsTool(server: McpServer) {
    const toolName = 'bit_component_details';
    const description =
      'Get detailed information about a specific component including basic info and optionally its public API schema';
    const schema: Record<string, any> = {
      cwd: z.string().describe('Path to workspace directory'),
      componentName: z.string().describe('Component name or component ID to get details for'),
      includeSchema: z.boolean().optional().describe('Include component public API schema (default: false)'),
    };

    server.tool(toolName, description, schema, async (params: any) => {
      try {
        const includeSchema = params.includeSchema === true;
        const componentName = params.componentName;

        // Get component details using IDE API with includeSchema parameter
        const ideApiResult = await this.callBitServerIDEAPI(
          'getCompDetails',
          [componentName, includeSchema],
          params.cwd
        );

        // IDE API returns the result directly, not wrapped in success/error structure
        const componentDetails: any = {
          show: ideApiResult,
        };

        return this.formatAsCallToolResult(componentDetails);
      } catch (error) {
        this.logger.error(`[MCP-DEBUG] Error in bit_component_details tool: ${(error as Error).message}`);
        return this.formatErrorAsCallToolResult(error as Error, 'getting component details');
      }
    });
  }

  private registerCommandsInfoTool(server: McpServer) {
    const toolName = 'bit_commands_info';
    const description =
      'Get information about Bit commands and their groups. Specify command or subcommand to get detailed info.';
    const schema: Record<string, any> = {
      extendedDescription: z
        .boolean()
        .optional()
        .describe('Include extended descriptions for commands (default: false)'),
      internal: z.boolean().optional().describe('Include internal/debug commands (default: false)'),
      command: z.string().optional().describe('Get info for a specific command only'),
      subcommand: z.string().optional().describe('Get info for subcommands of a specific main command'),
    };

    server.tool(toolName, description, schema, async (params: any) => {
      try {
        const {
          extendedDescription = false,
          internal = false,
          command: specificCommand,
          subcommand: specificSubcommand,
        } = params;
        const commandsInfo: any[] = [];

        const shouldSkipCommand = (cmd: Command): boolean => {
          return Boolean((cmd.private && !internal) || cmd.description.startsWith('DEPRECATED'));
        };

        const buildCommandInfo = (cmd: Command, parentName?: string, parentGroup?: string, detailed = false) => {
          if (shouldSkipCommand(cmd)) return null;

          const cmdName = parentName ? `${parentName} ${getCommandName(cmd)}` : getCommandName(cmd);
          const groupKey = cmd.group || parentGroup;

          const commandInfo: any = {
            name: cmdName,
            description: cmd.description || '',
          };

          if (extendedDescription && cmd.extendedDescription) {
            commandInfo.extendedDescription = cmd.extendedDescription;
          }
          if (groupKey) commandInfo.group = this.cli.groups[groupKey] || groupKey;

          if (!detailed) return commandInfo;

          // Add detailed information
          if (cmd.helpUrl) commandInfo.helpUrl = cmd.helpUrl;

          const argsData = getArgsData(cmd);
          if (argsData.length > 0) {
            commandInfo.arguments = argsData.map((arg) => ({
              name: arg.nameRaw,
              description: arg.description || '',
              required: arg.required,
              isArray: arg.isArray,
            }));
          }

          commandInfo.options = getFlagsData(cmd);
          commandInfo.examples = cmd.examples;

          if (cmd.commands && cmd.commands.length > 0) {
            commandInfo.subcommands = cmd.commands
              .filter((subCmd) => !shouldSkipCommand(subCmd))
              .map((subCmd) => ({
                name: `${cmdName} ${getCommandName(subCmd)}`,
                description: subCmd.description || '',
                alias: subCmd.alias || '',
                private: Boolean(subCmd.private),
              }));
          }

          return commandInfo;
        };

        // Handle specific command + subcommand lookup
        if (specificCommand && specificSubcommand) {
          this.cli.commands.forEach((cmd) => {
            if (getCommandName(cmd) === specificCommand && cmd.commands) {
              const subCmd = cmd.commands.find((sub) => getCommandName(sub) === specificSubcommand);
              if (subCmd) {
                const info = buildCommandInfo(subCmd, specificCommand, cmd.group, true);
                if (info) commandsInfo.push(info);
              }
            }
          });
        }
        // Handle subcommand-only lookup
        else if (specificSubcommand && !specificCommand) {
          this.cli.commands.forEach((cmd) => {
            if (getCommandName(cmd) === specificSubcommand && cmd.commands) {
              cmd.commands.forEach((subCmd) => {
                const info = buildCommandInfo(subCmd, specificSubcommand, cmd.group);
                if (info) commandsInfo.push(info);
              });
            }
          });
        }
        // Handle specific command lookup or general listing
        else {
          const isDetailedMode = Boolean(specificCommand);

          this.cli.commands.forEach((cmd) => {
            const mainCmdName = getCommandName(cmd);

            // Process main command
            if (!specificCommand || mainCmdName === specificCommand) {
              const info = buildCommandInfo(cmd, undefined, undefined, isDetailedMode);
              if (info && (!specificCommand || info.name === specificCommand)) {
                commandsInfo.push(info);
              }
            }

            // Process subcommands
            if (cmd.commands) {
              cmd.commands.forEach((subCmd) => {
                const subCmdInfo = buildCommandInfo(subCmd, mainCmdName, cmd.group, isDetailedMode);
                if (subCmdInfo && (!specificCommand || subCmdInfo.name === specificCommand)) {
                  commandsInfo.push(subCmdInfo);
                }
              });
            }
          });
        }

        commandsInfo.sort((a, b) => a.name.localeCompare(b.name));

        if (commandsInfo.length === 0) {
          let errorMessage = 'No commands found';
          if (specificCommand && specificSubcommand) {
            errorMessage = `No subcommand "${specificSubcommand}" found for command: ${specificCommand}`;
          } else if (specificCommand) {
            errorMessage = `No command found with name: ${specificCommand}`;
          } else if (specificSubcommand) {
            errorMessage = `No subcommands found for command: ${specificSubcommand}`;
          }
          return this.formatAsCallToolResult(errorMessage);
        }

        const result = JSON.stringify({ total: commandsInfo.length, commands: commandsInfo }, null, 2);
        this.logger.debug(`[MCP-DEBUG] Successfully retrieved commands info. Total: ${commandsInfo.length}`);
        return this.formatAsCallToolResult(result);
      } catch (error) {
        this.logger.error(`[MCP-DEBUG] Error in bit_commands_info tool: ${(error as Error).message}`);
        return this.formatErrorAsCallToolResult(error as Error, 'getting commands info');
      }
    });
  }

  private registerQueryTool(server: McpServer) {
    const toolName = 'bit_query';
    const description =
      'Execute read-only Bit commands that safely inspect workspace and component state without making modifications. Only whitelisted query commands are allowed for safety.';
    const schema: Record<string, any> = {
      cwd: z.string().describe('Path to workspace directory'),
      command: z.string().describe('The Bit command to execute (e.g., "status", "show", "list")'),
      args: z.array(z.string()).optional().describe('Arguments to pass to the command'),
      flags: z
        .record(z.union([z.string(), z.boolean()]))
        .optional()
        .describe('Flags to pass to the command as key-value pairs'),
    };

    server.tool(toolName, description, schema, async (params: any) => {
      try {
        const { command, args = [], flags = {}, cwd } = params;

        // Check if command is in the read-only whitelist
        // Support both single commands and subcommands (e.g., "lane show")
        const fullCommand = args.length > 0 ? `${command} ${args[0]}` : command;
        const isAllowed = this.readOnlyCommands.has(command) || this.readOnlyCommands.has(fullCommand);

        if (!isAllowed) {
          const allowedCommands = Array.from(this.readOnlyCommands).sort().join(', ');
          return this.formatAsCallToolResult(
            `Error: Command "${command}" is not allowed in query mode. Allowed read-only commands: ${allowedCommands}`
          );
        }

        // Build command arguments
        const commandArgs = [command, ...args];

        // Add flags to arguments
        Object.entries(flags).forEach(([key, value]) => {
          if (typeof value === 'boolean' && value) {
            commandArgs.push(`--${key}`);
          } else if (typeof value === 'string' && value) {
            commandArgs.push(`--${key}`);
            commandArgs.push(value);
          }
        });

        this.logger.debug(`[MCP-DEBUG] Executing query command: ${command} with args: ${JSON.stringify(commandArgs)}`);

        const result = await this.callBitServerAPI(command, args, flags, cwd);

        return this.formatAsCallToolResult(result);
      } catch (error) {
        this.logger.error(`[MCP-DEBUG] Error in bit_query tool: ${(error as Error).message}`);
        return this.formatErrorAsCallToolResult(error as Error, 'executing query command');
      }
    });
  }

  private registerExecuteTool(server: McpServer) {
    const toolName = 'bit_execute';
    const description =
      'Execute any Bit command, including those that modify workspace or repository state. ⚠️ Use with caution as this can make permanent changes to your project. Consider using bit_query for read-only operations.';
    const schema: Record<string, any> = {
      cwd: z.string().describe('Path to workspace directory'),
      command: z.string().describe('The Bit command to execute (e.g., "add", "tag", "export", "remove")'),
      args: z.array(z.string()).optional().describe('Arguments to pass to the command'),
      flags: z
        .record(z.union([z.string(), z.boolean()]))
        .optional()
        .describe('Flags to pass to the command as key-value pairs'),
    };

    server.tool(toolName, description, schema, async (params: any) => {
      try {
        const { command, args = [], flags = {}, cwd } = params;
        this.logger.debug(
          `[MCP-DEBUG] Executing command: ${command} with args: ${JSON.stringify(args)} and flags: ${JSON.stringify(flags)}`
        );
        const result = await this.callBitServerAPI(command, args, flags, cwd);
        return this.formatAsCallToolResult(result);
      } catch (error) {
        this.logger.error(`[MCP-DEBUG] Error in bit_execute tool: ${(error as Error).message}`);
        return this.formatErrorAsCallToolResult(error as Error, 'executing command');
      }
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

  /**
   * Helper method to execute a bit-server API call with standardized error handling
   */
  private async executeBitServerCommand(
    command: string,
    args: string[] = [],
    flags: Record<string, any> = {},
    cwd: string,
    operationName: string
  ): Promise<any> {
    try {
      const result = await this.callBitServerAPI(command, args, flags, cwd);
      this.logger.debug(`[MCP-DEBUG] Successfully executed ${operationName} via bit-server`);
      return result;
    } catch (error) {
      this.logger.warn(`[MCP-DEBUG] Failed to execute ${operationName} via bit-server: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Helper method to format any result as CallToolResult
   */
  private formatAsCallToolResult(result: any): CallToolResult {
    if (typeof result === 'string') {
      return { content: [{ type: 'text', text: result }] } as CallToolResult;
    } else if (typeof result === 'object') {
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } as CallToolResult;
    } else {
      return { content: [{ type: 'text', text: String(result) }] } as CallToolResult;
    }
  }

  /**
   * Helper method to format error as CallToolResult
   */
  private formatErrorAsCallToolResult(error: Error, operation: string): CallToolResult {
    return {
      content: [
        {
          type: 'text',
          text: `Error ${operation}: ${error.message}`,
        },
      ],
    } as CallToolResult;
  }

  /**
   * Helper method to safely execute a bit command with error handling
   */
  private async safeBitCommandExecution(
    command: string,
    args: string[] = [],
    flags: Record<string, any> = {},
    cwd: string,
    operationName: string,
    includeErrorInResult = false
  ): Promise<{ success: boolean; result: any; error?: string }> {
    try {
      const result = await this.executeBitServerCommand(command, args, flags, cwd, operationName);
      return { success: true, result };
    } catch (error) {
      if (includeErrorInResult) {
        return {
          success: false,
          result: { error: `Failed to ${operationName}: ${(error as Error).message}` },
          error: (error as Error).message,
        };
      } else {
        throw error;
      }
    }
  }

  static slots = [];
  static dependencies = [CLIAspect, LoggerAspect];
  static runtime = MainRuntime;
  static async provider([cli, loggerMain]: [CLIMain, LoggerMain]) {
    const logger = loggerMain.createLogger(CliMcpServerAspect.id);
    const mcpServer = new CliMcpServerMain(cli, logger);
    const mcpServerCmd = new McpServerCmd(mcpServer);
    mcpServerCmd.commands = [new McpStartCmd(mcpServer), new McpSetupCmd()];
    cli.register(mcpServerCmd);
    return mcpServer;
  }
}

CliMcpServerAspect.addRuntime(CliMcpServerMain);

export default CliMcpServerMain;
