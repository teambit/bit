import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { CliMcpServerMain } from './cli-mcp-server.main.runtime';

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
  description = 'Setup MCP integration with VS Code, Cursor, Windsurf, or other editors';
  extendedDescription =
    'Creates or updates configuration files to integrate Bit MCP server with supported editors. Currently supports VS Code, Cursor, and Windsurf.';
  arguments = [
    {
      name: 'editor',
      description: 'Editor to setup (default: vscode). Available: vscode, cursor, windsurf',
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

  constructor(private mcpServerMain: CliMcpServerMain) {}

  async report(
    [editor = 'vscode']: [string],
    { extended, consumerProject, includeOnly, includeAdditional, exclude, global: isGlobal = false }: McpSetupCmdOptions
  ): Promise<string> {
    try {
      await this.mcpServerMain.setupEditor(editor, {
        extended,
        consumerProject,
        includeOnly,
        includeAdditional,
        exclude,
        isGlobal,
      });

      const scope = isGlobal ? 'global' : 'workspace';
      const editorName = this.mcpServerMain.getEditorDisplayName(editor);
      return chalk.green(`✓ Successfully configured ${editorName} MCP integration (${scope})`);
    } catch (error) {
      const editorName = this.mcpServerMain.getEditorDisplayName(editor);
      return chalk.red(`Error setting up ${editorName} integration: ${(error as Error).message}`);
    }
  }
}
