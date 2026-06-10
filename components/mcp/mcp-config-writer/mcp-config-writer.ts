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
  consumerProject?: boolean;
  forceStandard?: boolean;
  /**
   * When set, this body is written verbatim instead of the default templates,
   * making `consumerProject` and `forceStandard` (which only steer template
   * selection inside `getDefaultRulesContent`) irrelevant.
   */
  content?: string;
}

/**
 * AI coding agents the Bit Cloud MCP can be wired up to during interactive init.
 */
export type CloudMcpEditor = 'claude-code' | 'codex' | 'cursor' | 'windsurf' | 'copilot';

/**
 * MCP Configuration Writer - A utility component for writing MCP server configurations
 * and rules files for various editors (VS Code, Cursor, Windsurf, Roo Code, Cline, Claude Code).
 *
 * This component can be used by various aspects including the CLI MCP server and the init command.
 */
export class McpConfigWriter {
  static readonly BIT_CLOUD_MCP_URL = 'https://mcp.bit.cloud/mcp';
  static readonly BIT_CLOUD_SERVER_NAME = 'bit-cloud';

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
   * Display names for every editor key the writer knows about — covers both
   * the legacy CLI-MCP editor set and the Cloud-MCP set.
   */
  static readonly EDITOR_DISPLAY_NAMES: Record<string, string> = {
    vscode: 'VS Code',
    cursor: 'Cursor',
    windsurf: 'Windsurf',
    roo: 'Roo Code',
    cline: 'Cline',
    'claude-code': 'Claude Code',
    codex: 'Codex',
    copilot: 'GitHub Copilot',
  };

  /**
   * Get display name for an editor; falls back to the raw key.
   */
  static getEditorDisplayName(editor: string): string {
    return this.EDITOR_DISPLAY_NAMES[editor.toLowerCase()] ?? editor;
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
   * Get VS Code mcp.json path for workspace configuration
   */
  static getVSCodeMcpConfigPath(workspaceDir?: string): string {
    const targetDir = workspaceDir || process.cwd();
    return path.join(targetDir, '.vscode', 'mcp.json');
  }

  /**
   * Setup VS Code MCP integration
   */
  static async setupVSCode(options: SetupOptions): Promise<void> {
    const { isGlobal, workspaceDir } = options;

    if (isGlobal) {
      // For global configuration, use settings.json with mcp.servers structure
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
        type: 'stdio',
        command: 'bit',
        args: args,
      };

      // Write updated settings
      await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
    } else {
      // For workspace configuration, use .vscode/mcp.json with direct servers structure
      const mcpConfigPath = this.getVSCodeMcpConfigPath(workspaceDir);

      // Ensure directory exists
      await fs.ensureDir(path.dirname(mcpConfigPath));

      // Read existing MCP configuration or create empty object
      const mcpConfig = await this.readJsonFile(mcpConfigPath);

      // Build MCP server args
      const args = this.buildMcpServerArgs(options);

      // Create or update MCP configuration
      if (!mcpConfig.servers) {
        mcpConfig.servers = {};
      }

      mcpConfig.servers['bit-cli'] = {
        type: 'stdio',
        command: 'bit',
        args: args,
      };

      // Write updated MCP configuration
      await fs.writeFile(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
    }
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
   * Get Roo Code mcp.json path based on global/workspace scope
   */
  static getRooCodeSettingsPath(isGlobal: boolean, workspaceDir?: string): string {
    if (isGlobal) {
      // Roo Code doesn't support global configuration, show warning
      throw new Error(
        'Roo Code global configuration is not supported as it uses VS Code internal storage that cannot be accessed. Please use workspace-specific configuration instead.'
      );
    } else {
      // Workspace-specific MCP configuration
      const targetDir = workspaceDir || process.cwd();
      return path.join(targetDir, '.roo', 'mcp.json');
    }
  }

  /**
   * Setup Roo Code MCP integration
   */
  static async setupRooCode(options: SetupOptions): Promise<void> {
    const { isGlobal, workspaceDir } = options;

    if (isGlobal) {
      throw new Error(
        'Roo Code global configuration is not supported as it uses VS Code internal storage that cannot be accessed. Please use workspace-specific configuration instead.'
      );
    }

    // Determine mcp.json path
    const mcpConfigPath = this.getRooCodeSettingsPath(isGlobal, workspaceDir);

    // Ensure directory exists
    await fs.ensureDir(path.dirname(mcpConfigPath));

    // Read existing MCP configuration or create empty object
    const mcpConfig = await this.readJsonFile(mcpConfigPath);

    // Build MCP server args
    const args = this.buildMcpServerArgs(options);

    // Create or update MCP configuration for Roo Code
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
   * Get Claude Code mcp.json path based on global/workspace scope
   */
  static getClaudeCodeSettingsPath(isGlobal: boolean, workspaceDir?: string): string {
    if (isGlobal) {
      // Global Claude Code MCP configuration
      const platform = process.platform;
      switch (platform) {
        case 'win32':
          return path.join(homedir(), 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
        case 'darwin':
          return path.join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
        case 'linux':
          return path.join(homedir(), '.config', 'claude', 'claude_desktop_config.json');
        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }
    } else {
      // Workspace-specific MCP configuration
      const targetDir = workspaceDir || process.cwd();
      return path.join(targetDir, '.mcp.json');
    }
  }

  /**
   * Setup Claude Code MCP integration
   */
  static async setupClaudeCode(options: SetupOptions): Promise<void> {
    const { isGlobal, workspaceDir } = options;

    // Determine mcp.json path
    const mcpConfigPath = this.getClaudeCodeSettingsPath(isGlobal, workspaceDir);

    // Ensure directory exists
    await fs.ensureDir(path.dirname(mcpConfigPath));

    // Read existing MCP configuration or create empty object
    const mcpConfig = await this.readJsonFile(mcpConfigPath);

    // Build MCP server args
    const args = this.buildMcpServerArgs(options);

    // Create or update MCP configuration for Claude Code
    if (!mcpConfig.mcpServers) {
      mcpConfig.mcpServers = {};
    }

    mcpConfig.mcpServers.bit = {
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
   * Get Roo Code prompts path based on global/workspace scope
   */
  static getRooCodePromptsPath(isGlobal: boolean, workspaceDir?: string): string {
    if (isGlobal) {
      // Global Roo Code rules
      return path.join(homedir(), '.roo', 'rules', 'bit.instructions.md');
    } else {
      // Workspace-specific rules
      const targetDir = workspaceDir || process.cwd();
      return path.join(targetDir, '.roo', 'rules', 'bit.instructions.md');
    }
  }

  /**
   * Get Cline prompts path based on global/workspace scope
   */
  static getClinePromptsPath(isGlobal: boolean, workspaceDir?: string): string {
    if (isGlobal) {
      // Global Cline rules - using Mac path as specified, error for others
      const platform = process.platform;
      if (platform === 'darwin') {
        return path.join(homedir(), 'Documents', 'Cline', 'Rules', 'bit.instructions.md');
      } else {
        throw new Error(
          `Global Cline rules configuration is not supported on ${platform}. ` +
            'The global path is only known for macOS (~/Documents/Cline/Rules/). ' +
            'For other operating systems, please use the --print flag to get the rules content ' +
            'and add it manually to your global Cline configuration.'
        );
      }
    } else {
      // Workspace-specific rules
      const targetDir = workspaceDir || process.cwd();
      return path.join(targetDir, '.clinerules', 'bit.instructions.md');
    }
  }

  /**
   * Get Claude Code prompts path based on global/workspace scope
   */
  static getClaudeCodePromptsPath(isGlobal: boolean, workspaceDir?: string): string {
    if (isGlobal) {
      // Global Claude Code rules - using .claude directory
      return path.join(homedir(), '.claude', 'bit.md');
    } else {
      // Workspace-specific rules in .claude directory
      const targetDir = workspaceDir || process.cwd();
      return path.join(targetDir, '.claude', 'bit.md');
    }
  }

  /**
   * Get default Bit MCP rules content from template file
   */
  static async getDefaultRulesContent(
    consumerProject: boolean = false,
    workspaceDir?: string,
    forceStandard: boolean = false
  ): Promise<string> {
    // Determine the directory to check for Git
    const targetDir = workspaceDir || process.cwd();

    // Check if .git directory exists (only if not forcing standard)
    const gitPath = path.join(targetDir, '.git');
    const hasGit = !forceStandard && (await fs.pathExists(gitPath));

    // Choose template based on consumer project status and Git presence
    let templateName: string;
    if (consumerProject) {
      templateName = 'bit-rules-consumer-template.md';
    } else if (hasGit) {
      templateName = 'bit-git-rules-template.md';
    } else {
      templateName = 'bit-rules-template.md';
    }

    const templatePath = path.join(__dirname, templateName);
    return fs.readFile(templatePath, 'utf8');
  }

  /**
   * Use the explicit `content` override if provided, otherwise pull from the
   * default rules template (CLI-MCP rules, picked by consumerProject/forceStandard).
   */
  private static async resolveRulesContent(options: RulesOptions): Promise<string> {
    const { content, consumerProject = false, workspaceDir, forceStandard = false } = options;
    return content ?? (await this.getDefaultRulesContent(consumerProject, workspaceDir, forceStandard));
  }

  /**
   * Write Bit MCP rules file for VS Code
   */
  static async writeVSCodeRules(options: RulesOptions): Promise<string> {
    const promptsPath = this.getVSCodePromptsPath(options.isGlobal, options.workspaceDir);
    await fs.ensureDir(path.dirname(promptsPath));
    const baseRulesContent = await this.resolveRulesContent(options);

    // Add VS Code frontmatter
    const vscodeRulesContent = `---
applyTo: '**'
---

${baseRulesContent}`;

    await fs.writeFile(promptsPath, vscodeRulesContent);
    return promptsPath;
  }

  /**
   * Write Bit MCP rules file for Cursor
   */
  static async writeCursorRules(options: RulesOptions): Promise<string> {
    const promptsPath = this.getCursorPromptsPath(options.isGlobal, options.workspaceDir);
    await fs.ensureDir(path.dirname(promptsPath));
    const baseRulesContent = await this.resolveRulesContent(options);

    // Add Cursor frontmatter. The auto-apply key is `alwaysApply` (lowercase) —
    // `Always` is not a recognized Cursor frontmatter key, so rules written with
    // it would not auto-apply.
    const cursorRulesContent = `---
description: Bit MCP Agent Instructions
alwaysApply: true
---

${baseRulesContent}`;

    await fs.writeFile(promptsPath, cursorRulesContent);
    return promptsPath;
  }

  /**
   * Write Bit MCP rules file for Roo Code (no frontmatter required).
   */
  static async writeRooCodeRules(options: RulesOptions): Promise<string> {
    const promptsPath = this.getRooCodePromptsPath(options.isGlobal, options.workspaceDir);
    await fs.ensureDir(path.dirname(promptsPath));
    await fs.writeFile(promptsPath, await this.resolveRulesContent(options));
    return promptsPath;
  }

  /**
   * Write Bit MCP rules file for Cline
   */
  static async writeClineRules(options: RulesOptions): Promise<string> {
    const promptsPath = this.getClinePromptsPath(options.isGlobal, options.workspaceDir);
    await fs.ensureDir(path.dirname(promptsPath));
    const baseRulesContent = await this.resolveRulesContent(options);

    // Add Cline frontmatter
    const clineRulesContent = `---
description: Bit MCP Agent Instructions
tags: ["bit", "mcp", "component-development"]
---

${baseRulesContent}`;

    await fs.writeFile(promptsPath, clineRulesContent);
    return promptsPath;
  }

  /**
   * Write Bit MCP rules file for Claude Code
   */
  static async writeClaudeCodeRules(options: RulesOptions): Promise<string> {
    const promptsPath = this.getClaudeCodePromptsPath(options.isGlobal, options.workspaceDir);
    await fs.ensureDir(path.dirname(promptsPath));
    const baseRulesContent = await this.resolveRulesContent(options);

    // Add integration instructions at the top (Claude Code doesn't use frontmatter)
    const integrationInstructions = `<!--
To use these Bit instructions, add the following to your main CLAUDE.md file:

@.claude/bit.md

This will automatically include all Bit-specific instructions in your Claude Code context.
-->

`;

    const finalContent = integrationInstructions + baseRulesContent;

    // Write rules content with integration instructions
    await fs.writeFile(promptsPath, finalContent);
    return promptsPath;
  }

  /**
   * Setup MCP server configuration for a specific editor
   */
  static async setupEditor(editor: string, options: SetupOptions): Promise<void> {
    const supportedEditors = ['vscode', 'cursor', 'windsurf', 'roo', 'cline', 'claude-code'];
    const editorLower = editor.toLowerCase();

    if (!supportedEditors.includes(editorLower)) {
      throw new Error(`Editor "${editor}" is not supported yet. Currently supported: ${supportedEditors.join(', ')}`);
    }

    if (editorLower === 'vscode') {
      await this.setupVSCode(options);
    } else if (editorLower === 'cursor') {
      await this.setupCursor(options);
    } else if (editorLower === 'windsurf') {
      await this.setupWindsurf(options);
    } else if (editorLower === 'roo') {
      await this.setupRooCode(options);
    } else if (editorLower === 'cline') {
      // Cline doesn't need MCP server setup, only rules files
      // This is a no-op but we include it for consistency
      // Users should use the 'rules' command to set up Cline instructions
    } else if (editorLower === 'claude-code') {
      await this.setupClaudeCode(options);
    }
  }

  /**
   * Write rules file for a specific editor. Returns the absolute path written.
   */
  static async writeRulesFile(editor: string, options: RulesOptions): Promise<string> {
    const supportedEditors = ['vscode', 'cursor', 'roo', 'cline', 'claude-code'];
    const editorLower = editor.toLowerCase();

    if (!supportedEditors.includes(editorLower)) {
      throw new Error(`Editor "${editor}" is not supported yet. Currently supported: ${supportedEditors.join(', ')}`);
    }

    if (editorLower === 'vscode') return this.writeVSCodeRules(options);
    if (editorLower === 'cursor') return this.writeCursorRules(options);
    if (editorLower === 'roo') return this.writeRooCodeRules(options);
    if (editorLower === 'cline') return this.writeClineRules(options);
    return this.writeClaudeCodeRules(options);
  }

  /**
   * Cloud MCP editors supported by the interactive init flow.
   */
  static readonly CLOUD_MCP_EDITORS: readonly CloudMcpEditor[] = [
    'claude-code',
    'codex',
    'cursor',
    'windsurf',
    'copilot',
  ];

  /**
   * Per-editor JSON-config recipe for Bit Cloud MCP: where the config file
   * lives, which top-level key holds the server map, and the shape of the
   * server entry. Codex is intentionally excluded — it uses TOML, see
   * `setupCloudCodex`.
   */
  private static readonly CLOUD_JSON_RECIPES: Record<
    Exclude<CloudMcpEditor, 'codex'>,
    {
      getPath: (workspaceDir?: string) => string;
      serversKey: 'mcpServers' | 'servers';
      entry: Record<string, string>;
    }
  > = {
    'claude-code': {
      getPath: (w) => McpConfigWriter.getClaudeCodeSettingsPath(false, w),
      serversKey: 'mcpServers',
      entry: { type: 'http', url: McpConfigWriter.BIT_CLOUD_MCP_URL },
    },
    cursor: {
      getPath: (w) => McpConfigWriter.getCursorSettingsPath(false, w),
      serversKey: 'mcpServers',
      entry: { url: McpConfigWriter.BIT_CLOUD_MCP_URL },
    },
    windsurf: {
      getPath: (w) => McpConfigWriter.getWindsurfSettingsPath(false, w),
      serversKey: 'mcpServers',
      entry: { serverUrl: McpConfigWriter.BIT_CLOUD_MCP_URL },
    },
    copilot: {
      getPath: (w) => McpConfigWriter.getVSCodeMcpConfigPath(w),
      serversKey: 'servers',
      entry: { type: 'http', url: McpConfigWriter.BIT_CLOUD_MCP_URL },
    },
  };

  /**
   * Setup Cloud MCP for an editor that uses a JSON config file.
   * Merges the bit-cloud entry into the existing config (preserving other servers).
   */
  private static async setupCloudJson(editor: Exclude<CloudMcpEditor, 'codex'>, workspaceDir?: string): Promise<void> {
    const recipe = this.CLOUD_JSON_RECIPES[editor];
    const configPath = recipe.getPath(workspaceDir);
    await fs.ensureDir(path.dirname(configPath));
    const cfg = await this.readJsonFile(configPath);
    if (!cfg[recipe.serversKey]) cfg[recipe.serversKey] = {};
    cfg[recipe.serversKey][this.BIT_CLOUD_SERVER_NAME] = recipe.entry;
    await fs.writeFile(configPath, JSON.stringify(cfg, null, 2));
  }

  /**
   * Pure helper that decides what should be written to a Codex `config.toml`
   * given its current contents. Returns `null` to signal "no change needed"
   * (the bit-cloud table is already present). Split out from `setupCloudCodex`
   * for direct testing without filesystem stubbing.
   *
   * Accepts the bare-key form `[mcp_servers.bit-cloud]`, the basic-string
   * quoted form `[mcp_servers."bit-cloud"]`, and the literal-string quoted
   * form `[mcp_servers.'bit-cloud']` — all valid TOML for the same table.
   * Whitespace inside the brackets is tolerated.
   */
  static buildCodexConfigUpdate(existing: string): string | null {
    const headerRegex = new RegExp(`^\\[\\s*mcp_servers\\.(["']?)${this.BIT_CLOUD_SERVER_NAME}\\1\\s*\\]`, 'm');
    if (headerRegex.test(existing)) return null;

    const block = `[mcp_servers.${this.BIT_CLOUD_SERVER_NAME}]\nurl = "${this.BIT_CLOUD_MCP_URL}"\n`;
    const separator = !existing ? '' : existing.endsWith('\n') ? '\n' : '\n\n';
    return existing + separator + block;
  }

  /**
   * Setup Cloud MCP for Codex (global `~/.codex/config.toml`).
   * Codex uses TOML and has no workspace-local config, so we append the
   * server block to the global file. If the bit-cloud table is already
   * present we leave the file untouched.
   */
  static async setupCloudCodex(): Promise<void> {
    const codexConfigPath = path.join(homedir(), '.codex', 'config.toml');
    await fs.ensureDir(path.dirname(codexConfigPath));

    let existing = '';
    try {
      existing = await fs.readFile(codexConfigPath, 'utf8');
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }

    const updated = this.buildCodexConfigUpdate(existing);
    if (updated === null) return;
    await fs.writeFile(codexConfigPath, updated);
  }

  /**
   * Setup Cloud MCP configuration for a specific editor.
   * Cloud MCP is an HTTP-transport server hosted by Bit, so no local
   * `bit` CLI is required.
   */
  static async setupCloudMcp(editor: string, workspaceDir?: string): Promise<void> {
    const editorLower = editor.toLowerCase() as CloudMcpEditor;
    if (!this.CLOUD_MCP_EDITORS.includes(editorLower)) {
      throw new Error(
        `Editor "${editor}" is not supported for Cloud MCP. Supported: ${this.CLOUD_MCP_EDITORS.join(', ')}`
      );
    }
    if (editorLower === 'codex') {
      await this.setupCloudCodex();
      return;
    }
    await this.setupCloudJson(editorLower, workspaceDir);
  }

  /**
   * Get the path to the editor config file based on editor type and scope
   */
  static getEditorConfigPath(editor: string, isGlobal: boolean, workspaceDir?: string): string {
    const editorLower = editor.toLowerCase();

    if (editorLower === 'vscode') {
      // For VS Code, return appropriate config path based on global vs workspace scope
      return isGlobal ? this.getVSCodeSettingsPath(isGlobal, workspaceDir) : this.getVSCodeMcpConfigPath(workspaceDir);
    } else if (editorLower === 'cursor') {
      return this.getCursorSettingsPath(isGlobal, workspaceDir);
    } else if (editorLower === 'windsurf') {
      return this.getWindsurfSettingsPath(isGlobal, workspaceDir);
    } else if (editorLower === 'roo') {
      return this.getRooCodeSettingsPath(isGlobal, workspaceDir);
    } else if (editorLower === 'cline') {
      return this.getClinePromptsPath(isGlobal, workspaceDir);
    } else if (editorLower === 'claude-code') {
      return this.getClaudeCodeSettingsPath(isGlobal, workspaceDir);
    }

    throw new Error(`Editor "${editor}" is not supported yet.`);
  }
}
