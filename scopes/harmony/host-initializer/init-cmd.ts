import chalk from 'chalk';
import * as pathlib from 'path';
import { BitError } from '@teambit/bit-error';
import { getConfig } from '@teambit/config-store';
import { InvalidScopeName, isValidScopeName } from '@teambit/legacy-bit-id';
import { initScope } from '@teambit/legacy.scope-api';
import { CFG_INIT_DEFAULT_SCOPE, CFG_INIT_DEFAULT_DIRECTORY } from '@teambit/legacy.constants';
import type { WorkspaceExtensionProps } from '@teambit/config';
import type { Command, CommandOptions } from '@teambit/cli';
import { formatSuccessSummary } from '@teambit/cli';
import { McpConfigWriter } from '@teambit/mcp.mcp-config-writer';
import type { InteractiveConfig } from './host-initializer.main.runtime';
import { HostInitializerMain } from './host-initializer.main.runtime';
import type { Logger } from '@teambit/logger';

export class InitCmd implements Command {
  name = 'init [path]';
  skipWorkspace = true;
  description = 'initialize a Bit workspace in an existing project';
  helpUrl = 'reference/workspace/creating-workspaces/?new_existing_project=1';
  group = 'workspace-setup';
  extendedDescription = `creates Bit configuration files in an existing project directory to start tracking components.
if already a workspace, validates and repairs Bit files as needed.
supports various reset options to recover from corrupted state or restart from scratch.`;
  alias = '';
  loadAspects = false;
  options = [
    ['n', 'name <workspace-name>', 'name of the workspace'],
    [
      '',
      'generator <env-id>',
      'for multiple, separate by a comma. add env-ids into the generators field in the workspace config for future "bit create" templates',
    ],
    [
      'T',
      'standalone',
      'do not nest component store within .git directory and do not write config data inside package.json',
    ],
    ['', 'no-package-json', 'do not generate package.json'],
    ['r', 'reset', 'write missing or damaged Bit files'],
    ['', 'reset-new', 'reset .bitmap file as if the components were newly added and remove all model data (objects)'],
    [
      '',
      'reset-lane-new',
      'same as reset-new, but it only resets components belonging to lanes. main components are left intact',
    ],
    [
      '',
      'reset-hard',
      'delete all Bit files and directories, including Bit configuration, tracking and model data. Useful for re-starting workspace from scratch',
    ],
    [
      '',
      'reset-scope',
      'removes local scope (.bit or .git/bit). tags/snaps that have not been exported will be lost. workspace is left intact',
    ],
    [
      'd',
      'default-directory <default-directory>',
      'set the default directory pattern to import/create components into',
    ],
    ['', 'default-scope <default-scope>', 'set the default scope for components in the workspace'],
    ['f', 'force', 'force workspace initialization without clearing local objects'],
    ['b', 'bare [name]', 'initialize an empty bit bare scope'],
    ['s', 'shared <groupname>', 'add group write permissions to a scope properly'],
    ['', 'external-package-manager', 'enable external package manager mode (npm/yarn/pnpm)'],
    ['', 'skip-interactive', 'skip interactive mode for Git repositories'],
    ['', 'agent [type]', 'create an AI agent instructions file. options: claude, cursor, copilot (default: AGENTS.md)'],
  ] as CommandOptions;

  constructor(
    private hostInitializer: HostInitializerMain,
    private logger: Logger
  ) {}

  private async handleInteractiveMode(
    projectPath: string,
    flags: Record<string, any>
  ): Promise<InteractiveConfig | null> {
    const {
      reset,
      resetNew,
      resetLaneNew,
      resetHard,
      resetScope,
      standalone,
      skipInteractive,
      externalPackageManager,
    } = flags;

    // Check if we should run interactive mode
    if (
      reset ||
      resetNew ||
      resetLaneNew ||
      resetHard ||
      resetScope ||
      standalone ||
      skipInteractive ||
      externalPackageManager ||
      !(await HostInitializerMain.hasGitDirectory(projectPath)) ||
      (await HostInitializerMain.hasWorkspaceInitialized(projectPath))
    ) {
      return null;
    }

    this.logger.off();
    this.logger.console(chalk.cyan('🔧 Interactive setup for existing Git repository\n'));

    try {
      const interactiveConfig = await HostInitializerMain.runInteractiveMode(projectPath);

      if (interactiveConfig.mcpEditor) {
        const displayName = McpConfigWriter.getEditorDisplayName(interactiveConfig.mcpEditor);
        this.logger.console(chalk.cyan(`\nConnecting Bit Cloud MCP to ${displayName}...`));
        await HostInitializerMain.setupMcpServer(interactiveConfig.mcpEditor, projectPath);
        this.logger.console(formatSuccessSummary(`Bit Cloud MCP connected to ${displayName}`));

        interactiveConfig.agentFileWritten = await HostInitializerMain.writeMcpAgentRules(
          interactiveConfig.mcpEditor,
          projectPath
        );
      }

      return interactiveConfig;
    } catch (error: any) {
      this.logger.consoleWarning(`Warning: Interactive setup failed: ${error.message}`);
      return null;
    }
  }

  async report([path]: [string], flags: Record<string, any>) {
    const {
      name,
      generator,
      bare,
      shared,
      standalone,
      noPackageJson,
      reset,
      resetNew,
      resetLaneNew,
      resetHard,
      resetScope,
      force,
      defaultDirectory,
      defaultScope,
      externalPackageManager,
      agent,
    } = flags;

    if (path) path = pathlib.resolve(path);

    if (bare) {
      if (reset || resetHard) throw new BitError('--reset and --reset-hard flags are not available for bare scope');
      // Handle both cases init --bare and init --bare [scopeName]
      const bareVal = bare === true ? '' : bare;
      await initScope(path, bareVal, shared);
      return formatSuccessSummary('initialized an empty bare bit scope.');
    }

    if (reset && resetHard) {
      throw new BitError('cannot use both --reset and --reset-hard, please use only one of them');
    }

    const defaultScopeToUse = defaultScope || getConfig(CFG_INIT_DEFAULT_SCOPE);
    // validate before creating any file, otherwise, the workspace is created with an invalid
    // default-scope and every subsequent command fails to load it.
    if (defaultScopeToUse && !isValidScopeName(defaultScopeToUse)) {
      throw new InvalidScopeName(defaultScopeToUse);
    }

    const projectPath = path || process.cwd();
    const interactiveConfig = await this.handleInteractiveMode(projectPath, flags);

    const workspaceExtensionProps: WorkspaceExtensionProps & { externalPackageManager?: boolean } = {
      defaultDirectory:
        interactiveConfig?.defaultDirectory ||
        (externalPackageManager ? 'bit-components/{scope}/{name}' : defaultDirectory) ||
        getConfig(CFG_INIT_DEFAULT_DIRECTORY),
      defaultScope: defaultScopeToUse,
      name,
      externalPackageManager: interactiveConfig?.externalPackageManager || externalPackageManager,
    };

    // Resolve agent flag: true means no specific type (use default AGENTS.md), string means a specific tool.
    const agentType = agent === true ? undefined : agent || undefined;

    // Skip the baseline `.mcp.json` only when the user explicitly opted out
    // of Cloud MCP in interactive mode. All other paths (non-interactive,
    // skip-interactive, no .git) still write it so it stays consistent with
    // the agent template that mentions a Cloud MCP config.
    const userOptedOutOfMcp = interactiveConfig !== null && !interactiveConfig.mcpEditor;

    const { created, agentFileWritten, mcpFileWritten } = await HostInitializerMain.init(
      path,
      standalone,
      noPackageJson,
      reset,
      resetNew,
      resetLaneNew,
      resetHard,
      resetScope,
      force,
      workspaceExtensionProps,
      interactiveConfig?.generator || generator,
      agentType,
      { skipDefaultMcp: userOptedOutOfMcp }
    );

    return HostInitializerMain.generateInitMessage(
      created,
      reset,
      resetHard,
      resetScope,
      interactiveConfig,
      interactiveConfig?.agentFileWritten ?? agentFileWritten,
      mcpFileWritten
    );
  }
}
