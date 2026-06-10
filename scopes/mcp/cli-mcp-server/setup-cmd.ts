import type { Command, CommandOptions } from '@teambit/cli';
import { formatSuccessSummary, formatHint, errorSymbol } from '@teambit/cli';
import type { CliMcpServerMain } from './cli-mcp-server.main.runtime';

export type McpSetupCmdOptions = {
  consumerProject?: boolean;
  includeAdditional?: string;
  global?: boolean;
};

export class McpSetupCmd implements Command {
  name = 'setup [editor]';
  description = 'Setup MCP integration with VS Code, Cursor, Windsurf, Roo Code, Cline, Claude Code, or other editors';
  extendedDescription =
    'Creates or updates configuration files to integrate Bit MCP server with supported editors. Currently supports VS Code, Cursor, Windsurf, Roo Code, Cline, and Claude Code.';
  arguments = [
    {
      name: 'editor',
      description: 'Editor to setup (default: vscode). Available: vscode, cursor, windsurf, roo, cline, claude-code',
    },
  ];
  options = [
    ['', 'consumer-project', 'Configure for non-Bit workspaces that only consume Bit component packages'],
    [
      '',
      'include-additional <commands>',
      'Add specific commands to the default MCP tools set. Use comma-separated list in quotes',
    ],
    ['g', 'global', 'Setup global configuration (default: workspace-specific)'],
  ] as CommandOptions;

  constructor(private mcpServerMain: CliMcpServerMain) {}

  async report(
    [editor = 'vscode']: [string],
    { consumerProject, includeAdditional, global: isGlobal = false }: McpSetupCmdOptions
  ): Promise<string> {
    try {
      await this.mcpServerMain.setupEditor(editor, {
        consumerProject,
        includeAdditional,
        isGlobal,
      });

      const scope = isGlobal ? 'global' : 'workspace';
      const editorName = this.mcpServerMain.getEditorDisplayName(editor);

      // Get the config file path based on the editor type
      const configPath = this.mcpServerMain.getEditorConfigPath(editor, isGlobal);

      // Special message for Claude Code to mention restart requirement
      if (editor.toLowerCase() === 'claude-code') {
        return [
          formatSuccessSummary(`configured ${editorName} MCP integration (${scope})`),
          `  Configuration written to: ${configPath}`,
          formatHint(`  Restart Claude Code to use the Bit MCP tools.`),
        ].join('\n');
      }

      return [
        formatSuccessSummary(`configured ${editorName} MCP integration (${scope})`),
        `  Configuration written to: ${configPath}`,
      ].join('\n');
    } catch (error) {
      const editorName = this.mcpServerMain.getEditorDisplayName(editor);
      return `${errorSymbol} Error setting up ${editorName} integration: ${(error as Error).message}`;
    }
  }
}
