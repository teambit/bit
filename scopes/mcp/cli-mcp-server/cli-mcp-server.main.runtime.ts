/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */

import type { CLIMain, Command } from '@teambit/cli';
import { CLIAspect, getArgsData, getCommandName, getFlagsData, MainRuntime } from '@teambit/cli';
import childProcess from 'child_process';
import stripAnsi from 'strip-ansi';
import fs from 'fs-extra';
import { parse } from 'comment-json';
import path from 'path';
import { CliMcpServerAspect } from './cli-mcp-server.aspect';
import { McpServerCmd, McpStartCmd } from './mcp-server.cmd';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { Logger, LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import { Http } from '@teambit/scope.network';
import { CENTRAL_BIT_HUB_NAME, SYMPHONY_GRAPHQL } from '@teambit/legacy.constants';
import fetch from 'node-fetch';
import { McpSetupCmd } from './setup-cmd';
import { McpRulesCmd } from './rules-cmd';
import type { SetupOptions, RulesOptions } from '@teambit/mcp.mcp-config-writer';
import { McpConfigWriter } from '@teambit/mcp.mcp-config-writer';

interface CommandFilterOptions {
  additionalCommandsSet?: Set<string>;
  alwaysExcludeTools: Set<string>;
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
  ) {
    // Validate the default bitBin on construction
    this.bitBin = this.validateBitBin(this.bitBin);
  }

  async getHttp(): Promise<Http> {
    if (!this._http) {
      this._http = await Http.connect(SYMPHONY_GRAPHQL, CENTRAL_BIT_HUB_NAME);
    }
    return this._http;
  }

  private async getBitServerPort(cwd: string, skipValidatePortFlag = false): Promise<number | undefined> {
    try {
      const args = ['cli-server-port'];
      if (skipValidatePortFlag) {
        args.push(String(skipValidatePortFlag));
      }

      const result = childProcess.spawnSync(this.bitBin, args, {
        cwd,
        env: { ...process.env, BIT_CLI_SERVER: 'true' },
        encoding: 'utf8',
      });

      if (result.error) {
        throw result.error;
      }

      if (result.status !== 0) {
        throw new Error(`Command failed with status ${result.status}: ${result.stderr}`);
      }

      const existingPort = result.stdout.trim();
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
          errorMessage = errorJson.message || errorJson || errorMessage;
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

  async runMcpServer(options: { includeAdditional?: string; bitBin?: string; consumerProject?: boolean }) {
    this.logger.debug(
      `[MCP-DEBUG] Starting MCP server with options: ${JSON.stringify(options)}. CWD: ${process.cwd()}`
    );
    const commands = this.cli.commands;

    // Validate and set bitBin with security checks
    if (options.bitBin) {
      this.bitBin = this.validateBitBin(options.bitBin);
    }
    // If no bitBin provided, keep the default 'bit'

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
    let additionalCommandsSet: Set<string> | undefined;
    if (options.includeAdditional) {
      additionalCommandsSet = new Set(options.includeAdditional.split(',').map((cmd) => cmd.trim()));
      this.logger.debug(`[MCP-DEBUG] Including additional commands: ${Array.from(additionalCommandsSet).join(', ')}`);
    }

    const server = new McpServer({
      name: 'bit-cli-mcp',
      version: '0.0.1',
    });

    // Set of tools for consumer projects (non-Bit workspaces)
    const consumerProjectTools = new Set<string>();

    const consumerProject = Boolean(options.consumerProject);

    // Store consumer project mode globally in the class
    this.isConsumerProjectMode = consumerProject;

    // Validate flags combination
    if (consumerProject) {
      this.logger.debug(
        `[MCP-DEBUG] Running MCP server in consumer project mode (for non-Bit workspaces) with tools: bit_remote_search, bit_remote_component_details`
      );
      if (options.includeAdditional) {
        this.logger.debug(
          `[MCP-DEBUG] Additional tools enabled in consumer project mode: ${options.includeAdditional}`
        );
      }
    }

    const filterOptions: CommandFilterOptions = {
      additionalCommandsSet,
      alwaysExcludeTools,
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

    // Always register remote-search tool
    this.registerRemoteSearchTool(server);

    // In consumer project mode, only register bit_remote_search and bit_remote_component_details
    // All other tools should not be available in consumer project mode
    if (consumerProject) {
      // Register the new combined remote component details tool
      this.registerRemoteComponentDetailsTool(server);
    } else {
      // Register the bit_workspace_info tool
      this.registerWorkspaceInfoTool(server);

      // Register the bit_component_details tool
      this.registerComponentDetailsTool(server);

      // Register the bit_create tool
      this.registerCreateTool(server);

      // Register command discovery and help tools
      this.registerCommandsListTool(server);
      this.registerCommandHelpTool(server);

      this.registerQueryTool(server);
      this.registerExecuteTool(server);
    }

    await server.connect(new StdioServerTransport());
  }

  private shouldIncludeCommand(cmdName: string, options: CommandFilterOptions): boolean {
    // Always exclude certain commands
    if (options.alwaysExcludeTools.has(cmdName)) return false;

    // Consumer project mode: only include consumer project tools + any additional specified
    if (options.consumerProject) {
      const shouldInclude =
        options.consumerProjectTools.has(cmdName) || (options.additionalCommandsSet?.has(cmdName) ?? false);
      if (shouldInclude) {
        this.logger.debug(`[MCP-DEBUG] Including command in consumer project mode: ${cmdName}`);
      }
      return shouldInclude;
    }

    // Default mode: only include additional specified commands (no default tools anymore)
    return options.additionalCommandsSet?.has(cmdName) ?? false;
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

  /**
   * Read and parse workspace.jsonc file from a given directory
   */
  private async readWorkspaceJsonc(workspaceDir: string): Promise<any> {
    try {
      const workspaceJsoncPath = path.join(workspaceDir, 'workspace.jsonc');
      const fileExists = await fs.pathExists(workspaceJsoncPath);
      if (!fileExists) {
        this.logger.debug(`[MCP-DEBUG] workspace.jsonc not found at ${workspaceJsoncPath}`);
        return null;
      }

      const content = await fs.readFile(workspaceJsoncPath, 'utf-8');
      return parse(content);
    } catch (error) {
      this.logger.debug(`[MCP-DEBUG] Failed to read workspace.jsonc: ${error}`);
      return null;
    }
  }

  /**
   * Extract owner from defaultScope in workspace.jsonc
   * If defaultScope contains a dot, split by dot and take the first part
   */
  private extractOwnerFromWorkspace(workspaceConfig: any): string | null {
    try {
      const workspaceSection = workspaceConfig?.['teambit.workspace/workspace'];
      const defaultScope = workspaceSection?.defaultScope;

      if (!defaultScope || typeof defaultScope !== 'string') {
        return null;
      }

      // If defaultScope contains a dot, split by dot and take the first part (owner)
      if (defaultScope.includes('.')) {
        const parts = defaultScope.split('.');
        return parts[0];
      }

      // If no dot, the entire defaultScope is treated as the owner
      return defaultScope;
    } catch (error) {
      this.logger.debug(`[MCP-DEBUG] Failed to extract owner from workspace config: ${error}`);
      return null;
    }
  }

  private registerRemoteSearchTool(server: McpServer) {
    const toolName = 'bit_remote_search';
    const description = `Search for components in remote scopes using parallel queries for efficient discovery. Always provide multiple search terms - either variations/synonyms of one component type, or different components needed for a task. Examples: ["button", "btn", "click"] for variations, or ["input", "button", "validation"] for form components.`;
    const schema: Record<string, any> = {
      queries: z
        .array(z.string())
        .describe(
          `Array of search query strings for parallel searching. Each query should be a single keyword or a few broad keywords. Search for variations/synonyms of one component type, or different components needed for a task. Examples: ["btn", "button"] for variations, or ["table", "pagination", "filter"] for data display features.`
        ),
      cwd: z.string().optional().describe('Path to workspace directory'),
      owners: z
        .array(z.string())
        .optional()
        .describe(
          'Filter results by specific owners or organizations. AVOID using this parameter - let the system automatically extract the owner from workspace.jsonc defaultScope for better relevance. Only use when you need to override the automatic behavior or search across different owners'
        ),
      skipAutoOwner: z
        .boolean()
        .optional()
        .describe(
          'Set to true to disable automatic owner extraction from workspace.jsonc. When false or omitted, the system will try to automatically extract owner from workspace defaultScope'
        ),
    };
    server.tool(toolName, description, schema, async (params: any) => {
      const http = await this.getHttp();

      // Validate that queries parameter is provided and valid
      if (!params.queries || !Array.isArray(params.queries) || params.queries.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: queries parameter must be provided as a non-empty array of search terms. Example: ["button", "btn", "click"]',
            },
          ],
        };
      }

      const searchQueries = params.queries;

      // Determine the owners to use for the search
      let ownersToUse = params.owners && params.owners.length > 0 ? params.owners : undefined;

      // If owners not explicitly provided and skipAutoOwner is not true, try to extract from workspace.jsonc
      if (!ownersToUse && !params.skipAutoOwner) {
        try {
          // Use provided cwd parameter or fall back to current working directory
          const workspaceDir = params.cwd || process.cwd();
          this.logger.debug(`[MCP-DEBUG] Attempting to auto-extract owner from workspace.jsonc in: ${workspaceDir}`);
          const workspaceConfig = await this.readWorkspaceJsonc(workspaceDir);
          if (workspaceConfig) {
            const extractedOwner = this.extractOwnerFromWorkspace(workspaceConfig);
            if (extractedOwner) {
              ownersToUse = [extractedOwner];
              this.logger.debug(`[MCP-DEBUG] Auto-extracted owner from workspace.jsonc: ${extractedOwner}`);
            }
          }
        } catch (error) {
          this.logger.debug(`[MCP-DEBUG] Failed to auto-extract owner: ${error}`);
          // Continue without auto-extracted owner
        }
      } else {
        this.logger.debug(
          `[MCP-DEBUG] Using provided owners for search: ${ownersToUse ? ownersToUse.join(', ') : 'none'}`
        );
      }

      // Execute searches in parallel
      this.logger.debug(
        `[MCP-DEBUG] Executing ${searchQueries.length} search(es) in parallel: ${searchQueries.join(', ')}`
      );

      try {
        const searchPromises = searchQueries.map(async (query: string) => {
          try {
            const result = await http.search(query, ownersToUse);
            return {
              query,
              success: true,
              components: result?.components || [],
              totalCount: result?.components?.length || 0,
            };
          } catch (error) {
            this.logger.warn(`[MCP-DEBUG] Search failed for query "${query}": ${(error as Error).message}`);
            return {
              query,
              success: false,
              error: (error as Error).message,
              components: [],
              totalCount: 0,
            };
          }
        });

        const searchResults = await Promise.all(searchPromises);

        // Process and consolidate results
        const allComponents = new Set<string>();
        const resultsByQuery: any[] = [];
        let totalComponentsFound = 0;

        searchResults.forEach((result) => {
          resultsByQuery.push({
            query: result.query,
            success: result.success,
            count: result.totalCount,
            error: result.error || undefined,
          });

          if (result.success && result.components.length > 0) {
            result.components.forEach((component: string) => allComponents.add(component));
            totalComponentsFound += result.totalCount;
          }
        });

        // Format the consolidated results
        if (allComponents.size === 0) {
          const failedQueries = searchResults.filter((r) => !r.success);
          let message = 'No results found';
          if (failedQueries.length > 0) {
            message += `\n\nSome searches failed:`;
            failedQueries.forEach((r) => {
              message += `\n- "${r.query}": ${r.error}`;
            });
          }
          return { content: [{ type: 'text', text: message }] };
        }

        // Build the response text
        let responseText = `Found ${allComponents.size} unique components from ${searchQueries.length} parallel search${searchQueries.length > 1 ? 'es' : ''}:\n\n`;

        // Show per-query results summary
        responseText += 'Search Summary:\n';
        resultsByQuery.forEach((result) => {
          if (result.success) {
            responseText += `- "${result.query}": ${result.count} components\n`;
          } else {
            responseText += `- "${result.query}": FAILED (${result.error})\n`;
          }
        });
        responseText += '\nConsolidated Results:\n';

        responseText += Array.from(allComponents).join('\n');

        const formattedResults = {
          type: 'text',
          text: responseText,
        };

        this.logger.debug(
          `[MCP-DEBUG] Consolidated search results: ${allComponents.size} unique components from ${totalComponentsFound} total results`
        );
        return { content: [formattedResults] } as CallToolResult;
      } catch (error) {
        this.logger.error(`[MCP-DEBUG] Error during parallel search execution: ${(error as Error).message}`);
        return { content: [{ type: 'text', text: `Error executing searches: ${(error as Error).message}` }] };
      }
    });
  }

  private registerRemoteComponentDetailsTool(server: McpServer) {
    const toolName = 'bit_remote_component_details';
    const description =
      'Get detailed information about a remote component including basic info and its public API schema. Combines the functionality of show and schema commands for remote components.';
    const schema: Record<string, any> = {
      cwd: z.string().describe('Path to workspace directory'),
      componentName: z.string().describe('Component name or component ID to get details for'),
      includeSchema: z.boolean().optional().describe('Include component public API schema (default: true)'),
    };

    server.tool(toolName, description, schema, async (params: any) => {
      try {
        const { componentName, includeSchema = true, cwd } = params;

        // Get basic component information using show command via direct execution
        const showArgs = ['show', componentName, '--remote', '--legacy'];
        const showResult = await this.runBit(showArgs, cwd);

        const result: any = {
          componentInfo: showResult.content[0].text,
        };

        // Get schema information if requested
        if (includeSchema) {
          try {
            const schemaArgs = ['schema', componentName, '--remote'];
            const schemaResult = await this.runBit(schemaArgs, cwd);
            result.schema = schemaResult.content[0].text;
          } catch (schemaError) {
            this.logger.warn(
              `[MCP-DEBUG] Failed to get schema for ${componentName}: ${(schemaError as Error).message}`
            );
            result.schemaError = `Failed to retrieve schema: ${(schemaError as Error).message}`;
          }
        }

        return this.formatAsCallToolResult(result);
      } catch (error) {
        this.logger.error(`[MCP-DEBUG] Error in bit_remote_component_details tool: ${(error as Error).message}`);
        return this.formatErrorAsCallToolResult(error as Error, 'getting remote component details');
      }
    });
  }

  private registerWorkspaceInfoTool(server: McpServer) {
    const toolName = 'bit_workspace_info';
    const description =
      'Get comprehensive workspace information including status, components list, apps, templates, dependency graph, and workspace dependencies';
    const schema: Record<string, any> = {
      cwd: z.string().describe('Path to workspace directory'),
      includeTemplates: z.boolean().optional().describe('Include templates list (default: false)'),
      includeApps: z.boolean().optional().describe('Include apps list (default: false)'),
      includeGraph: z.boolean().optional().describe('Include dependency graph (default: false)'),
      json: z
        .boolean()
        .optional()
        .describe(
          'Return output in JSON format - WARNING: This produces verbose output and should be used when structured data is specifically needed (default: false)'
        ),
    };

    server.tool(toolName, description, schema, async (params: any) => {
      try {
        const includeTemplates = params.includeTemplates === true; // default: false
        const includeApps = params.includeApps === true;
        const includeGraph = params.includeGraph === true;
        const useJson = params.json === true;

        const workspaceInfo: any = {};
        const flags = useJson ? { json: true } : {};

        const statusExecution = await this.safeBitCommandExecution(
          'status',
          [],
          flags,
          params.cwd,
          'get workspace status',
          true
        );
        workspaceInfo.status = statusExecution.result;

        const listExecution = await this.safeBitCommandExecution(
          'list',
          [],
          flags,
          params.cwd,
          'get components list',
          true
        );
        workspaceInfo.list = listExecution.result;

        // Get apps list if requested
        if (includeApps) {
          const appsExecution = await this.safeBitCommandExecution(
            'app',
            ['list'],
            flags,
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
            flags,
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

        // Get workspace dependencies if requested
        try {
          const workspaceDependencies = await this.callBitServerIDEAPI('getWorkspaceDependencies', [], params.cwd);
          workspaceInfo.workspaceDependencies = workspaceDependencies;
        } catch (error) {
          this.logger.error(`[MCP-DEBUG] Error getting workspace dependencies: ${(error as Error).message}`);
          workspaceInfo.workspaceDependencies = {
            error: `Failed to get workspace dependencies: ${(error as Error).message}`,
          };
        }

        // Get current lane name with scope
        try {
          const laneId = await this.callBitServerIDEAPI('getCurrentLaneName', [true], params.cwd);
          workspaceInfo.laneId = laneId;
        } catch (error) {
          this.logger.error(`[MCP-DEBUG] Error getting current lane name: ${(error as Error).message}`);
          workspaceInfo.laneId = {
            error: `Failed to get current lane name: ${(error as Error).message}`,
          };
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

        return this.formatAsCallToolResult(ideApiResult);
      } catch (error) {
        this.logger.error(`[MCP-DEBUG] Error in bit_component_details tool: ${(error as Error).message}`);
        return this.formatErrorAsCallToolResult(error as Error, 'getting component details');
      }
    });
  }

  private registerCreateTool(server: McpServer) {
    const toolName = 'bit_create';
    const description = 'Create a new component (source files and config) using a template.';
    const schema: Record<string, any> = {
      cwd: z.string().describe('Path to workspace directory'),
      templateName: z
        .string()
        .describe('The template for generating the component (run "bit templates" for a list of available templates)'),
      componentNames: z.array(z.string()).describe('A list of component names to generate'),
      namespace: z.string().optional().describe("Sets the component's namespace and nested dirs inside the scope"),
      scope: z
        .string()
        .optional()
        .describe("Sets the component's scope-name. If not entered, the default-scope will be used"),
      aspect: z
        .string()
        .optional()
        .describe('Aspect-id of the template. Helpful when multiple aspects use the same template name'),
      template: z.string().optional().describe('Env-id of the template. Alias for --aspect'),
      path: z
        .string()
        .optional()
        .describe('Relative path in the workspace. By default the path is <scope>/<namespace>/<name>'),
      env: z
        .string()
        .optional()
        .describe("Set the component's environment. (overrides the env from variants and the template)"),
      force: z.boolean().optional().describe('Replace existing files at the target location'),
    };

    server.tool(toolName, description, schema, async (params: any) => {
      try {
        const args = params.componentNames;
        const flags: Record<string, string | boolean> = {};

        // Add optional flags
        if (params.namespace) flags.namespace = params.namespace;
        if (params.scope) flags.scope = params.scope;
        if (params.aspect) flags.aspect = params.aspect;
        if (params.template) flags.template = params.template;
        if (params.path) flags.path = params.path;
        if (params.env) flags.env = params.env;
        if (params.force) flags.force = true;

        // Add template name as first argument
        const allArgs = [params.templateName, ...args];

        const execution = await this.safeBitCommandExecution('create', allArgs, flags, params.cwd, 'create component');
        return this.formatAsCallToolResult(execution.result);
      } catch (error) {
        this.logger.error(`[MCP-DEBUG] Error in bit_create tool: ${(error as Error).message}`);
        return this.formatErrorAsCallToolResult(error as Error, 'creating component');
      }
    });
  }

  private registerCommandsListTool(server: McpServer) {
    const toolName = 'bit_commands_list';
    const description =
      'Get all available Bit commands with descriptions and groups. Use this to discover what commands are available.';
    const schema: Record<string, any> = {
      extendedDescription: z
        .boolean()
        .optional()
        .describe('Include extended descriptions for commands (default: false)'),
      internal: z.boolean().optional().describe('Include internal/debug commands (default: false)'),
    };

    server.tool(toolName, description, schema, async (params: any) => {
      try {
        const { extendedDescription = false, internal = false } = params;
        const commandsInfo: any[] = [];

        const shouldSkipCommand = (cmd: Command): boolean => {
          return Boolean((cmd.private && !internal) || cmd.description.startsWith('DEPRECATED'));
        };

        // Build list of all commands
        this.cli.commands.forEach((cmd) => {
          if (shouldSkipCommand(cmd)) return;

          const mainCmdName = getCommandName(cmd);
          const groupKey = cmd.group;

          const commandInfo: any = {
            name: mainCmdName,
            description: cmd.description || '',
          };

          if (extendedDescription && cmd.extendedDescription) {
            commandInfo.extendedDescription = cmd.extendedDescription;
          }
          if (groupKey) commandInfo.group = this.cli.groups[groupKey] || groupKey;

          // Add subcommands summary
          if (cmd.commands && cmd.commands.length > 0) {
            commandInfo.subcommands = cmd.commands
              .filter((subCmd) => !shouldSkipCommand(subCmd))
              .map((subCmd) => ({
                name: getCommandName(subCmd),
                description: subCmd.description || '',
              }));
          }

          commandsInfo.push(commandInfo);
        });

        commandsInfo.sort((a, b) => a.name.localeCompare(b.name));

        const result = JSON.stringify({ total: commandsInfo.length, commands: commandsInfo }, null, 2);
        this.logger.debug(`[MCP-DEBUG] Successfully retrieved commands list. Total: ${commandsInfo.length}`);
        return this.formatAsCallToolResult(result);
      } catch (error) {
        this.logger.error(`[MCP-DEBUG] Error in bit_commands_list tool: ${(error as Error).message}`);
        return this.formatErrorAsCallToolResult(error as Error, 'getting commands list');
      }
    });
  }

  private registerCommandHelpTool(server: McpServer) {
    const toolName = 'bit_command_help';
    const description =
      'Get detailed help for a specific Bit command including syntax, arguments, flags, and usage examples. Use this to understand exactly how to use a command.';
    const schema: Record<string, any> = {
      command: z.string().describe('The command name to get help for (e.g., "status", "install", "create")'),
      subcommand: z
        .string()
        .optional()
        .describe('Optional subcommand name (e.g., for "lane show", use command="lane" and subcommand="show")'),
    };

    server.tool(toolName, description, schema, async (params: any) => {
      try {
        const { command: requestedCommand, subcommand: requestedSubcommand } = params;
        let commandInfo: any = null;

        const buildDetailedCommandInfo = (cmd: Command, parentName?: string) => {
          const cmdName = parentName ? `${parentName} ${getCommandName(cmd)}` : getCommandName(cmd);

          const info: any = {
            name: cmdName,
            description: cmd.description || '',
            extendedDescription: cmd.extendedDescription || '',
            group: cmd.group ? this.cli.groups[cmd.group] || cmd.group : '',
          };

          // Add arguments information
          const argsData = getArgsData(cmd);
          if (argsData.length > 0) {
            info.arguments = argsData.map((arg) => ({
              name: arg.nameRaw,
              description: arg.description || '',
              required: arg.required,
              isArray: arg.isArray,
            }));
          }

          // Add options/flags information
          info.options = getFlagsData(cmd);

          // Add examples if available
          if (cmd.examples) {
            info.examples = cmd.examples;
          }

          // Add subcommands if available (including private ones for help purposes)
          if (cmd.commands && cmd.commands.length > 0) {
            info.subcommands = cmd.commands.map((subCmd) => ({
              name: getCommandName(subCmd),
              description: subCmd.description || '',
            }));
          }

          return info;
        };

        // Search for the requested command
        this.cli.commands.forEach((cmd) => {
          const mainCmdName = getCommandName(cmd);

          if (requestedSubcommand) {
            // Looking for a subcommand
            if (mainCmdName === requestedCommand && cmd.commands) {
              const subCmd = cmd.commands.find((sub) => getCommandName(sub) === requestedSubcommand);
              if (subCmd) {
                commandInfo = buildDetailedCommandInfo(subCmd, requestedCommand);
              }
            }
          } else {
            // Looking for a main command
            if (mainCmdName === requestedCommand) {
              commandInfo = buildDetailedCommandInfo(cmd);
            }
          }
        });

        if (!commandInfo) {
          const commandFullName = requestedSubcommand ? `${requestedCommand} ${requestedSubcommand}` : requestedCommand;
          return this.formatAsCallToolResult(`Command not found: ${commandFullName}`);
        }

        const result = JSON.stringify(commandInfo, null, 2);
        this.logger.debug(`[MCP-DEBUG] Successfully retrieved command help for: ${commandInfo.name}`);
        return this.formatAsCallToolResult(result);
      } catch (error) {
        this.logger.error(`[MCP-DEBUG] Error in bit_command_help tool: ${(error as Error).message}`);
        return this.formatErrorAsCallToolResult(error as Error, 'getting command help');
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

        const execution = await this.safeBitCommandExecution(
          command,
          args,
          flags,
          cwd,
          `execute query command ${command}`
        );

        return this.formatAsCallToolResult(execution.result);
      } catch (error) {
        this.logger.error(`[MCP-DEBUG] Error in bit_query tool: ${(error as Error).message}`);
        return this.formatErrorAsCallToolResult(error as Error, 'executing query command');
      }
    });
  }

  private registerExecuteTool(server: McpServer) {
    const toolName = 'bit_execute';
    const description = 'Execute Bit commands that make changes to workspace or components (not read-only).';
    const schema: Record<string, any> = {
      cwd: z.string().describe('Path to workspace directory'),
      command: z.string().describe('The Bit command to execute (e.g., "import", "tag", "export", "remove")'),
      args: z.array(z.string()).optional().describe('Arguments to pass to the command'),
      flags: z
        .record(z.union([z.string(), z.boolean()]))
        .optional()
        .describe('Flags to pass to the command as key-value pairs'),
    };

    server.tool(toolName, description, schema, async (params: any) => {
      try {
        let { command, args = [] } = params;
        const { flags = {}, cwd } = params;

        // Handle sub-commands: if command has multiple words, move the second word to args
        const commandParts = command.trim().split(/\s+/);
        if (commandParts.length > 1) {
          command = commandParts[0];
          args = [commandParts[1], ...args];
        }

        this.logger.debug(
          `[MCP-DEBUG] Executing command: ${command} with args: ${JSON.stringify(args)} and flags: ${JSON.stringify(flags)}`
        );

        const execution = await this.safeBitCommandExecution(command, args, flags, cwd, `execute command ${command}`);

        return this.formatAsCallToolResult(execution.result);
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
    try {
      const result = childProcess.spawnSync(this.bitBin, args, {
        cwd,
        env: { ...process.env, BIT_DISABLE_SPINNER: '1' },
        encoding: 'utf8',
      });

      if (result.error) {
        throw result.error;
      }

      if (result.status !== 0) {
        const errorMessage = result.stderr || `Command failed with status ${result.status}`;
        throw new Error(errorMessage);
      }

      this.logger.debug(`[MCP-DEBUG] result. stdout: ${result.stdout}`);
      return { content: [{ type: 'text', text: result.stdout }] };
    } catch (error: any) {
      this.logger.error(`[MCP-DEBUG] Error executing ${this.bitBin} ${args.join(' ')}`, error);
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
      let result = await this.executeBitServerCommand(command, args, flags, cwd, operationName);

      // Unwrap the result from data wrapper if it exists and we have a successful result
      if (result && typeof result === 'object' && 'data' in result && result.data !== undefined) {
        result = result.data;
      }

      // Clean up output by removing ANSI color codes when not using JSON format
      const useJson = flags && flags.json === true;
      if (!useJson && typeof result === 'string') {
        result = stripAnsi(result);
      }

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
  private validateBitBin(bitBin: string): string {
    const trimmed = bitBin?.trim();
    // Check for shell metacharacters and spaces. Protect against command injection.
    if (!trimmed || /[;&|`$(){}[\]<>'"\\]/.test(trimmed) || /\s/.test(trimmed)) throw new Error('Invalid bitBin');
    return trimmed;
  }

  // Setup command business logic methods
  getEditorDisplayName(editor: string): string {
    return McpConfigWriter.getEditorDisplayName(editor);
  }

  /**
   * Get the path to the editor config file based on editor type and scope
   */
  getEditorConfigPath(editor: string, isGlobal: boolean, workspaceDir?: string): string {
    return McpConfigWriter.getEditorConfigPath(editor, isGlobal, workspaceDir);
  }

  async setupEditor(editor: string, options: SetupOptions, workspaceDir?: string): Promise<void> {
    // Add workspaceDir to options if provided
    const setupOptions: SetupOptions = { ...options };
    if (workspaceDir) {
      setupOptions.workspaceDir = workspaceDir;
    }

    await McpConfigWriter.setupEditor(editor, setupOptions);
  }

  async writeRulesFile(editor: string, options: RulesOptions, workspaceDir?: string): Promise<void> {
    // Add workspaceDir to options if provided
    const rulesOptions: RulesOptions = { ...options };
    if (workspaceDir) {
      rulesOptions.workspaceDir = workspaceDir;
    }

    await McpConfigWriter.writeRulesFile(editor, rulesOptions);
  }

  async getRulesContent(consumerProject: boolean = false): Promise<string> {
    return McpConfigWriter.getDefaultRulesContent(consumerProject);
  }

  static slots = [];
  static dependencies = [CLIAspect, LoggerAspect];
  static runtime = MainRuntime;
  static async provider([cli, loggerMain]: [CLIMain, LoggerMain]) {
    const logger = loggerMain.createLogger(CliMcpServerAspect.id);
    const mcpServer = new CliMcpServerMain(cli, logger);
    const mcpServerCmd = new McpServerCmd(mcpServer);
    mcpServerCmd.commands = [new McpStartCmd(mcpServer), new McpSetupCmd(mcpServer), new McpRulesCmd(mcpServer)];
    cli.register(mcpServerCmd);
    return mcpServer;
  }
}

CliMcpServerAspect.addRuntime(CliMcpServerMain);

export default CliMcpServerMain;
