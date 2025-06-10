import fs from 'fs-extra';
import path from 'path';
import { homedir } from 'os';

/**
 * Options for setting up MCP server configuration
 */
export interface SetupOptions {
  consumerProject?: boolean;
  includeAdditional?: string;
  isGlobal: boolean;
  workspaceDir?: string;
}

/**
 * Options for writing rules/instructions files
 */
export interface RulesOptions {
  isGlobal: boolean;
  workspaceDir?: string;
}

/**
 * Utility class for setting up MCP server configurations across different editors
 */
export class McpSetupUtils {
  /**
   * Build MCP server arguments based on provided options
   */
  static buildMcpServerArgs(options: SetupOptions): string[] {
    const { consumerProject, includeAdditional } = options;
    const args = ['mcp-server', 'start'];

    if (consumerProject) {
      args.push('--consumer-project');
    }

    if (includeAdditional) {
      args.push('--include-additional', includeAdditional);
    }

    return args;
  }

  /**
   * Read and parse a JSON file, returning empty object if file doesn't exist
   */
  static async readJsonFile(filePath: string): Promise<any> {
    if (!(await fs.pathExists(filePath))) {
      return {};
    }

    try {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to parse ${path.basename(filePath)}: ${(error as Error).message}`);
    }
  }

  /**
   * Get display name for an editor
   */
  static getEditorDisplayName(editor: string): string {
    switch (editor) {
      case 'vscode':
        return 'VS Code';
      case 'cursor':
        return 'Cursor';
      case 'windsurf':
        return 'Windsurf';
      default:
        return editor;
    }
  }

  /**
   * Get VS Code settings.json path based on global/workspace scope
   */
  static getVSCodeSettingsPath(isGlobal: boolean, workspaceDir?: string): string {
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
      const targetDir = workspaceDir || process.cwd();
      return path.join(targetDir, '.vscode', 'settings.json');
    }
  }

  /**
   * Setup VS Code MCP integration
   */
  static async setupVSCode(options: SetupOptions): Promise<void> {
    const { isGlobal, workspaceDir } = options;

    // Determine settings.json path
    const settingsPath = this.getVSCodeSettingsPath(isGlobal, workspaceDir);

    // Ensure directory exists
    await fs.ensureDir(path.dirname(settingsPath));

    // Read existing settings or create empty object
    const settings = await this.readJsonFile(settingsPath);

    // Build MCP server args
    const args = this.buildMcpServerArgs(options);

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

  /**
   * Get Cursor mcp.json path based on global/workspace scope
   */
  static getCursorSettingsPath(isGlobal: boolean, workspaceDir?: string): string {
    if (isGlobal) {
      // Global Cursor MCP configuration
      return path.join(homedir(), '.cursor', 'mcp.json');
    } else {
      // Workspace-specific MCP configuration
      const targetDir = workspaceDir || process.cwd();
      return path.join(targetDir, '.cursor', 'mcp.json');
    }
  }

  /**
   * Setup Cursor MCP integration
   */
  static async setupCursor(options: SetupOptions): Promise<void> {
    const { isGlobal, workspaceDir } = options;

    // Determine mcp.json path
    const mcpConfigPath = this.getCursorSettingsPath(isGlobal, workspaceDir);

    // Ensure directory exists
    await fs.ensureDir(path.dirname(mcpConfigPath));

    // Read existing MCP configuration or create empty object
    const mcpConfig = await this.readJsonFile(mcpConfigPath);

    // Build MCP server args
    const args = this.buildMcpServerArgs(options);

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

  /**
   * Get Windsurf mcp.json path based on global/workspace scope
   */
  static getWindsurfSettingsPath(isGlobal: boolean, workspaceDir?: string): string {
    if (isGlobal) {
      // Global Windsurf MCP configuration
      return path.join(homedir(), '.windsurf', 'mcp.json');
    } else {
      // Workspace-specific MCP configuration
      const targetDir = workspaceDir || process.cwd();
      return path.join(targetDir, '.windsurf', 'mcp.json');
    }
  }

  /**
   * Setup Windsurf MCP integration
   */
  static async setupWindsurf(options: SetupOptions): Promise<void> {
    const { isGlobal, workspaceDir } = options;

    // Determine mcp.json path
    const mcpConfigPath = this.getWindsurfSettingsPath(isGlobal, workspaceDir);

    // Ensure directory exists
    await fs.ensureDir(path.dirname(mcpConfigPath));

    // Read existing MCP configuration or create empty object
    const mcpConfig = await this.readJsonFile(mcpConfigPath);

    // Build MCP server args
    const args = this.buildMcpServerArgs(options);

    // Create or update MCP configuration for Windsurf
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

  /**
   * Get VS Code prompts path based on global/workspace scope
   */
  static getVSCodePromptsPath(isGlobal: boolean, workspaceDir?: string): string {
    if (isGlobal) {
      // Global VS Code prompts - use the official User Data prompts directory
      const platform = process.platform;
      switch (platform) {
        case 'win32':
          return path.join(homedir(), 'AppData', 'Roaming', 'Code', 'User', 'prompts', 'bit.instructions.md');
        case 'darwin':
          return path.join(
            homedir(),
            'Library',
            'Application Support',
            'Code',
            'User',
            'prompts',
            'bit.instructions.md'
          );
        case 'linux':
          return path.join(homedir(), '.config', 'Code', 'User', 'prompts', 'bit.instructions.md');
        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }
    } else {
      // Workspace-specific prompts
      const targetDir = workspaceDir || process.cwd();
      return path.join(targetDir, '.github', 'instructions', 'bit.instructions.md');
    }
  }

  /**
   * Get Cursor prompts path based on global/workspace scope
   */
  static getCursorPromptsPath(isGlobal: boolean, workspaceDir?: string): string {
    if (isGlobal) {
      throw new Error('Cursor does not support global prompts configuration in a file');
    } else {
      const targetDir = workspaceDir || process.cwd();
      return path.join(targetDir, '.cursor', 'rules', 'bit.rules.mdc');
    }
  }

  /**
   * Get Windsurf prompts path based on global/workspace scope
   */
  static getWindsurfPromptsPath(isGlobal: boolean, workspaceDir?: string): string {
    if (isGlobal) {
      // Global Windsurf rules - use bit.rules.md in home directory
      return path.join(homedir(), '.windsurf', 'bit.rules.md');
    } else {
      // Workspace-specific rules - use .windsurf/rules directory with bit.rules.md file
      const targetDir = workspaceDir || process.cwd();
      return path.join(targetDir, '.windsurf', 'rules', 'bit.rules.md');
    }
  }

  /**
   * Get default Bit MCP rules content from template file
   */
  static getDefaultRulesContent(): Promise<string> {
    const templatePath = path.join(__dirname, 'bit-rules-template.md');
    return fs.readFile(templatePath, 'utf8');
  }

  /**
   * Write Bit MCP rules file for VS Code
   */
  static async writeVSCodeRules(options: RulesOptions): Promise<void> {
    const { isGlobal, workspaceDir } = options;

    // Determine prompts file path
    const promptsPath = this.getVSCodePromptsPath(isGlobal, workspaceDir);

    // Ensure directory exists
    await fs.ensureDir(path.dirname(promptsPath));

    // Write rules content
    const rulesContent = await this.getDefaultRulesContent();
    await fs.writeFile(promptsPath, rulesContent);
  }

  /**
   * Write Bit MCP rules file for Cursor
   */
  static async writeCursorRules(options: RulesOptions): Promise<void> {
    const { isGlobal, workspaceDir } = options;

    // Determine prompts file path
    const promptsPath = this.getCursorPromptsPath(isGlobal, workspaceDir);

    // Ensure directory exists
    await fs.ensureDir(path.dirname(promptsPath));

    // Write rules content
    const rulesContent = await this.getDefaultRulesContent();
    await fs.writeFile(promptsPath, rulesContent);
  }

  /**
   * Write Bit MCP rules file for Windsurf
   */
  static async writeWindsurfRules(options: RulesOptions): Promise<void> {
    const { isGlobal, workspaceDir } = options;

    // Determine prompts file path
    const promptsPath = this.getWindsurfPromptsPath(isGlobal, workspaceDir);

    // Ensure directory exists
    await fs.ensureDir(path.dirname(promptsPath));

    // Write rules content
    const rulesContent = await this.getDefaultRulesContent();
    await fs.writeFile(promptsPath, rulesContent);
  }
}
