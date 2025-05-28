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
import fetch from 'node-fetch';

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

    // Build the command array: [command, ...args, ...flagsAsArgs]
    const commandArray = [command, ...args];

    // Convert flags to command line arguments
    for (const [key, value] of Object.entries(flags)) {
      if (value === true) {
        commandArray.push(`--${key}`);
      } else if (value !== false && value !== undefined) {
        commandArray.push(`--${key}`, String(value));
      }
    }

    // Resolve the real path to handle symlinks (e.g., /tmp -> /private/tmp on macOS)
    const fs = require('fs');
    const realCwd = fs.realpathSync(cwd);

    const body = {
      command: commandArray,
      pwd: realCwd,
    };

    try {
      const response = await fetch(`${this.serverUrl}/cli-raw`, {
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
        return this.callBitServerAPI(command, args, flags, cwd, true);
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
    const defaultTools = new Set(['show', 'create', 'templates', 'schema', 'remote-search']);

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
    const description = 'Get comprehensive workspace information including status, components list, and apps';
    const schema: Record<string, any> = {
      cwd: z.string().describe('Path to workspace directory'),
      includeStatus: z.boolean().optional().describe('Include workspace status (default: true)'),
      includeList: z.boolean().optional().describe('Include components list (default: false)'),
      includeApps: z.boolean().optional().describe('Include apps list (default: false)'),
    };

    server.tool(toolName, description, schema, async (params: any) => {
      try {
        const includeStatus = params.includeStatus !== false; // Default to true
        const includeList = params.includeList === true;
        const includeApps = params.includeApps === true;

        const workspaceInfo: any = {};

        // Get workspace status using bit-server API
        if (includeStatus) {
          try {
            const statusResult = await this.callBitServerAPI('status', [], { json: true }, params.cwd);
            workspaceInfo.status = statusResult;
            this.logger.debug(`[MCP-DEBUG] Successfully retrieved workspace status via bit-server`);
          } catch (error) {
            this.logger.warn(`[MCP-DEBUG] Failed to get status via bit-server: ${(error as Error).message}`);
            workspaceInfo.status = { error: `Failed to get status: ${(error as Error).message}` };
          }
        }

        // Get components list if requested
        if (includeList) {
          try {
            const listResult = await this.callBitServerAPI('list', [], { json: true }, params.cwd);
            workspaceInfo.list = listResult;
            this.logger.debug(`[MCP-DEBUG] Successfully retrieved components list via bit-server`);
          } catch (error) {
            this.logger.warn(`[MCP-DEBUG] Failed to get list via bit-server: ${(error as Error).message}`);
            workspaceInfo.list = { error: `Failed to get list: ${(error as Error).message}` };
          }
        }

        // Get apps list if requested
        if (includeApps) {
          try {
            const appsResult = await this.callBitServerAPI('app', ['list'], { json: true }, params.cwd);
            workspaceInfo.apps = appsResult;
            this.logger.debug(`[MCP-DEBUG] Successfully retrieved apps list via bit-server`);
          } catch (error) {
            this.logger.warn(`[MCP-DEBUG] Failed to get apps via bit-server: ${(error as Error).message}`);
            workspaceInfo.apps = { error: `Failed to get apps: ${(error as Error).message}` };
          }
        }

        const formattedOutput = JSON.stringify(workspaceInfo, null, 2);
        return { content: [{ type: 'text', text: formattedOutput }] } as CallToolResult;
      } catch (error) {
        this.logger.error(`[MCP-DEBUG] Error in bit_workspace_info tool: ${(error as Error).message}`);
        return {
          content: [
            {
              type: 'text',
              text: `Error getting workspace info: ${(error as Error).message}`,
            },
          ],
        } as CallToolResult;
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
