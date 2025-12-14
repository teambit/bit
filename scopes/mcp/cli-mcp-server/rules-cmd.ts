import type { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import type { CliMcpServerMain } from './cli-mcp-server.main.runtime';

export type McpRulesCmdOptions = {
  global?: boolean;
  print?: boolean;
  consumerProject?: boolean;
  forceStandard?: boolean;
};

export class McpRulesCmd implements Command {
  name = 'rules [editor]';
  description =
    'Write Bit MCP rules/instructions file for VS Code, Cursor, Roo Code, Cline, Claude Code, or print to screen';
  extendedDescription =
    'Creates or updates rules/instructions markdown files to provide AI assistants with guidance on using Bit MCP server. Currently supports VS Code, Cursor, Roo Code, Cline, and Claude Code. For Claude Code, creates .claude/bit.md to avoid overwriting existing CLAUDE.md files. Use --print to display content on screen. Use --consumer-project for non-Bit workspaces that only consume components as packages. Use --force-standard to use standard Bit rules instead of Git-integrated template.';
  arguments = [
    {
      name: 'editor',
      description: 'Editor to write rules for (default: vscode). Available: vscode, cursor, roo, cline, claude-code',
    },
  ];
  options = [
    ['g', 'global', 'Write rules to global configuration (default: workspace-specific)'],
    ['p', 'print', 'Print rules content to screen instead of writing to file'],
    ['', 'consumer-project', 'Generate rules for consumer projects that only use Bit components as packages'],
    [
      '',
      'force-standard',
      'Use standard Bit rules template instead of Git-integrated template (even when .git exists)',
    ],
  ] as CommandOptions;

  constructor(private mcpServerMain: CliMcpServerMain) {}

  async report(
    [editor = 'vscode']: [string],
    {
      global: isGlobal = false,
      print: shouldPrint = false,
      consumerProject = false,
      forceStandard = false,
    }: McpRulesCmdOptions
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
        const rulesContent = await this.mcpServerMain.getRulesContent(consumerProject, forceStandard);
        return rulesContent;
      }

      await this.mcpServerMain.writeRulesFile(editor, {
        isGlobal,
        consumerProject,
        forceStandard,
      });

      const scope = isGlobal ? 'global' : 'workspace';
      const editorName = this.mcpServerMain.getEditorDisplayName(editor);

      // Special message for Claude Code to explain the file location
      if (editor.toLowerCase() === 'claude-code') {
        const filePath = isGlobal ? '~/.claude/bit.md' : '.claude/bit.md';
        const atSyntax = isGlobal ? '@~/.claude/bit.md' : '@.claude/bit.md';

        return chalk.green(
          `✓ Successfully wrote ${editorName} Bit rules file (${scope})\n` +
            `  File created: ${chalk.cyan(filePath)}\n\n` +
            `  ${chalk.yellow('Integration:')} Add this line to your main CLAUDE.md file:\n` +
            `  ${chalk.cyan(atSyntax)}\n\n` +
            `  ${chalk.gray('This will automatically include all Bit-specific instructions.')}`
        );
      }

      // Get the file path for the rules file to show user where it was written
      const rulesPath = this.mcpServerMain.getRulesFilePath(editor, isGlobal);

      return chalk.green(
        `✓ Successfully wrote ${editorName} Bit MCP rules file (${scope})\n` +
          `  File written to: ${chalk.cyan(rulesPath)}`
      );
    } catch (error) {
      const editorName = this.mcpServerMain.getEditorDisplayName(editor);
      return chalk.red(`Error writing ${editorName} rules file: ${(error as Error).message}`);
    }
  }
}
