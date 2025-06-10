import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { CliMcpServerMain } from './cli-mcp-server.main.runtime';

export type McpRulesCmdOptions = {
  global?: boolean;
};

export class McpRulesCmd implements Command {
  name = 'rules [editor]';
  description = 'Write Bit MCP rules/instructions file for VS Code, Cursor, Windsurf, or other editors';
  extendedDescription =
    'Creates or updates rules/instructions markdown files to provide AI assistants with guidance on using Bit MCP server. Currently supports VS Code, Cursor, and Windsurf.';
  arguments = [
    {
      name: 'editor',
      description: 'Editor to write rules for (default: vscode). Available: vscode, cursor, windsurf',
    },
  ];
  options = [['g', 'global', 'Write rules to global configuration (default: workspace-specific)']] as CommandOptions;

  constructor(private mcpServerMain: CliMcpServerMain) {}

  async report([editor = 'vscode']: [string], { global: isGlobal = false }: McpRulesCmdOptions): Promise<string> {
    try {
      await this.mcpServerMain.writeRulesFile(editor, {
        isGlobal,
      });

      const scope = isGlobal ? 'global' : 'workspace';
      const editorName = this.mcpServerMain.getEditorDisplayName(editor);
      return chalk.green(`✓ Successfully wrote ${editorName} Bit MCP rules file (${scope})`);
    } catch (error) {
      const editorName = this.mcpServerMain.getEditorDisplayName(editor);
      return chalk.red(`Error writing ${editorName} rules file: ${(error as Error).message}`);
    }
  }
}
