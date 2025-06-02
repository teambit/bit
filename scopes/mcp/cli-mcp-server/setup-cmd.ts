import { Command, CommandOptions } from '@teambit/cli';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { homedir } from 'os';

export type McpSetupCmdOptions = {
  extended?: boolean;
  consumerProject?: boolean;
  includeOnly?: string;
  includeAdditional?: string;
  exclude?: string;
  global?: boolean;
};

export class McpSetupCmd implements Command {
  name = 'setup [editor]';
  description = 'Setup MCP integration with VS Code, Cursor, or other editors';
  extendedDescription =
    'Creates or updates configuration files to integrate Bit MCP server with supported editors. Currently supports VS Code and Cursor.';
  arguments = [
    {
      name: 'editor',
      description: 'Editor to setup (default: vscode). Available: vscode, cursor',
    },
  ];
  options = [
    ['e', 'extended', 'Enable the full set of Bit CLI commands as MCP tools'],
    ['', 'consumer-project', 'Configure for non-Bit workspaces that only consume Bit component packages'],
    [
      '',
      'include-only <commands>',
      'Specify a subset of commands to expose as MCP tools. Use comma-separated list in quotes',
    ],
    [
      '',
      'include-additional <commands>',
      'Add specific commands to the default MCP tools set. Use comma-separated list in quotes',
    ],
    [
      '',
      'exclude <commands>',
      'Prevent specific commands from being exposed as MCP tools. Use comma-separated list in quotes',
    ],
    ['g', 'global', 'Setup global configuration (default: workspace-specific)'],
  ] as CommandOptions;

  async report(
    [editor = 'vscode']: [string],
    { extended, consumerProject, includeOnly, includeAdditional, exclude, global: isGlobal = false }: McpSetupCmdOptions
  ): Promise<string> {
    const supportedEditors = ['vscode', 'cursor'];
    const editorLower = editor.toLowerCase();

    if (!supportedEditors.includes(editorLower)) {
      return chalk.red(
        `Error: Editor "${editor}" is not supported yet. Currently supported: ${supportedEditors.join(', ')}`
      );
    }

    try {
      if (editorLower === 'vscode') {
        await this.setupVSCode({
          extended,
          consumerProject,
          includeOnly,
          includeAdditional,
          exclude,
          isGlobal,
        });
      } else if (editorLower === 'cursor') {
        await this.setupCursor({
          extended,
          consumerProject,
          includeOnly,
          includeAdditional,
          exclude,
          isGlobal,
        });
      }

      const scope = isGlobal ? 'global' : 'workspace';
      const editorName = editorLower === 'vscode' ? 'VS Code' : 'Cursor';
      return chalk.green(`✓ Successfully configured ${editorName} MCP integration (${scope})`);
    } catch (error) {
      const editorName = editorLower === 'vscode' ? 'VS Code' : 'Cursor';
      return chalk.red(`Error setting up ${editorName} integration: ${(error as Error).message}`);
    }
  }

  private async setupVSCode(options: {
    extended?: boolean;
    consumerProject?: boolean;
    includeOnly?: string;
    includeAdditional?: string;
    exclude?: string;
    isGlobal: boolean;
  }): Promise<void> {
    const { extended, consumerProject, includeOnly, includeAdditional, exclude, isGlobal } = options;

    // Determine settings.json path
    const settingsPath = this.getVSCodeSettingsPath(isGlobal);

    // Ensure directory exists
    await fs.ensureDir(path.dirname(settingsPath));

    // Read existing settings or create empty object
    let settings: any = {};
    if (await fs.pathExists(settingsPath)) {
      try {
        const content = await fs.readFile(settingsPath, 'utf8');
        settings = JSON.parse(content);
      } catch (error) {
        throw new Error(`Failed to parse existing settings.json: ${(error as Error).message}`);
      }
    }

    // Build MCP server args
    const args = ['mcp-server'];

    if (extended) {
      args.push('--extended');
    }

    if (consumerProject) {
      args.push('--consumer-project');
    }

    if (includeOnly) {
      args.push('--include-only', includeOnly);
    }

    if (includeAdditional) {
      args.push('--include-additional', includeAdditional);
    }

    if (exclude) {
      args.push('--exclude', exclude);
    }

    // Create or update MCP configuration
    if (!settings.mcp) {
      settings.mcp = {};
    }

    if (!settings.mcp.servers) {
      settings.mcp.servers = {};
    }

    settings.mcp.servers['bit-cli'] = {
      command: 'bit',
      args: args,
    };

    // Write updated settings
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
  }

  private getVSCodeSettingsPath(isGlobal: boolean): string {
    if (isGlobal) {
      // Global VS Code settings
      const platform = process.platform;
      switch (platform) {
        case 'win32':
          return path.join(homedir(), 'AppData', 'Roaming', 'Code', 'User', 'settings.json');
        case 'darwin':
          return path.join(homedir(), 'Library', 'Application Support', 'Code', 'User', 'settings.json');
        case 'linux':
          return path.join(homedir(), '.config', 'Code', 'User', 'settings.json');
        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }
    } else {
      // Workspace-specific settings
      const workspaceDir = process.cwd();
      return path.join(workspaceDir, '.vscode', 'settings.json');
    }
  }

  private async setupCursor(options: {
    extended?: boolean;
    consumerProject?: boolean;
    includeOnly?: string;
    includeAdditional?: string;
    exclude?: string;
    isGlobal: boolean;
  }): Promise<void> {
    const { extended, consumerProject, includeOnly, includeAdditional, exclude, isGlobal } = options;

    // Determine mcp.json path
    const mcpConfigPath = this.getCursorSettingsPath(isGlobal);

    // Ensure directory exists
    await fs.ensureDir(path.dirname(mcpConfigPath));

    // Read existing MCP configuration or create empty object
    let mcpConfig: any = {};
    if (await fs.pathExists(mcpConfigPath)) {
      try {
        const content = await fs.readFile(mcpConfigPath, 'utf8');
        mcpConfig = JSON.parse(content);
      } catch (error) {
        throw new Error(`Failed to parse existing mcp.json: ${(error as Error).message}`);
      }
    }

    // Build MCP server args
    const args = ['mcp-server'];

    if (extended) {
      args.push('--extended');
    }

    if (consumerProject) {
      args.push('--consumer-project');
    }

    if (includeOnly) {
      args.push('--include-only', includeOnly);
    }

    if (includeAdditional) {
      args.push('--include-additional', includeAdditional);
    }

    if (exclude) {
      args.push('--exclude', exclude);
    }

    // Create or update MCP configuration for Cursor
    if (!mcpConfig.mcpServers) {
      mcpConfig.mcpServers = {};
    }

    mcpConfig.mcpServers.bit = {
      type: 'stdio',
      command: 'bit',
      args: args,
    };

    // Write updated MCP configuration
    await fs.writeFile(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
  }

  private getCursorSettingsPath(isGlobal: boolean): string {
    if (isGlobal) {
      // Global Cursor MCP configuration
      const platform = process.platform;
      switch (platform) {
        case 'win32':
          return path.join(homedir(), 'AppData', 'Roaming', 'Cursor', 'User', 'mcp.json');
        case 'darwin':
          return path.join(homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'mcp.json');
        case 'linux':
          return path.join(homedir(), '.config', 'Cursor', 'User', 'mcp.json');
        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }
    } else {
      // Workspace-specific MCP configuration
      const workspaceDir = process.cwd();
      return path.join(workspaceDir, '.cursor', 'mcp.json');
    }
  }
}
