import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { CliMcpServerMain } from './cli-mcp-server.main.runtime';

export type McpRulesCmdOptions = {
  global?: boolean;
  print?: boolean;
};

export class McpRulesCmd implements Command {
  name = 'rules [editor]';
  description = 'Write Bit MCP rules/instructions file for VS Code, Cursor, or print to screen';
  extendedDescription =
    'Creates or updates rules/instructions markdown files to provide AI assistants with guidance on using Bit MCP server. Currently supports VS Code and Cursor. Use --print to display content on screen.';
  arguments = [
    {
      name: 'editor',
      description: 'Editor to write rules for (default: vscode). Available: vscode, cursor',
    },
  ];
  options = [
    ['g', 'global', 'Write rules to global configuration (default: workspace-specific)'],
    ['p', 'print', 'Print rules content to screen instead of writing to file'],
  ] as CommandOptions;

  constructor(private mcpServerMain: CliMcpServerMain) {}

  async report(
    [editor = 'vscode']: [string],
    { global: isGlobal = false, print: shouldPrint = false }: McpRulesCmdOptions
  ): Promise<string> {
    try {
      // Handle Windsurf requests by directing to print option
      if (editor.toLowerCase() === 'windsurf') {
        if (!shouldPrint) {
          return chalk.yellow(
            '⚠️  Windsurf uses a single-file configuration (.windsurfrules) that is complex to manage automatically.\n' +
              'Please use --print flag to get the rules content and manually add it to your .windsurfrules file.'
          );
        }
        // If print is requested, we'll show the content below
      }

      if (shouldPrint) {
        const rulesContent = await this.mcpServerMain.getRulesContent();
        return rulesContent;
      }

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
