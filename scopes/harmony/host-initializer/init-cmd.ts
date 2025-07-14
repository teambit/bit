import chalk from 'chalk';
import * as pathlib from 'path';
import * as fs from 'fs-extra';
import { prompt } from 'enquirer';
import { BitError } from '@teambit/bit-error';
import { getConfig } from '@teambit/config-store';
import { initScope } from '@teambit/legacy.scope-api';
import { CFG_INIT_DEFAULT_SCOPE, CFG_INIT_DEFAULT_DIRECTORY } from '@teambit/legacy.constants';
import { WorkspaceExtensionProps, WorkspaceConfig } from '@teambit/config';
import { Command, CommandOptions } from '@teambit/cli';
import { HostInitializerMain } from './host-initializer.main.runtime';
import { Logger } from '@teambit/logger';

export class InitCmd implements Command {
  name = 'init [path]';
  skipWorkspace = true;
  description = 'create or reinitialize an empty workspace';
  helpUrl = 'reference/workspace/creating-workspaces/?new_existing_project=1';
  group = 'workspace-setup';
  extendedDescription =
    'if the current directory is already a workspace, it validates that bit files are correct and rewrite them if needed.';
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
      'same as reset-new, but it only resets components belong to lanes. main components are left intact',
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
  ] as CommandOptions;

  constructor(
    private hostInitializer: HostInitializerMain,
    private logger: Logger
  ) {}

  /**
   * Check if the directory contains a .git folder
   */
  private async hasGitDirectory(path: string): Promise<boolean> {
    try {
      const gitPath = pathlib.join(path, '.git');
      const stat = await fs.stat(gitPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Check if the directory already has a bit workspace initialized
   */
  private async hasWorkspaceInitialized(path: string): Promise<boolean> {
    try {
      const isExist = await WorkspaceConfig.isExist(path);
      return Boolean(isExist);
    } catch {
      return false;
    }
  }

  /**
   * Prompt user for environment selection
   */
  private async promptForEnvironment(): Promise<string | null> {
    const envChoices = [
      { name: 'none', message: 'None (default)' },
      { name: 'bitdev.node/node-env', message: 'Node.js environment' },
      { name: 'bitdev.react/react-env', message: 'React environment' },
      { name: 'bitdev.vue/vue-env', message: 'Vue environment' },
      { name: 'bitdev.angular/angular-env', message: 'Angular environment' },
      { name: 'bitdev.symphony/envs/symphony-env', message: 'Symphony environment' },
    ];

    try {
      const response = (await prompt({
        type: 'select',
        name: 'environment',
        message: 'Which environment would you like to use?',
        choices: envChoices,
        initial: 0, // Default to 'none'
        cancel() {
          // By default, canceling the prompt via Ctrl+c throws an empty string.
          // The custom cancel function prevents that behavior.
          // Otherwise, Bit CLI would print an error and confuse users.
          // See related issue: https://github.com/enquirer/enquirer/issues/225
        },
      } as any)) as { environment: string };

      return response.environment === 'none' ? null : response.environment;
    } catch (err: any) {
      if (!err || err === '') {
        // for some reason, when the user clicks Ctrl+C, the error is an empty string
        throw new Error('The prompt has been canceled');
      }
      throw err;
    }
  }

  /**
   * Prompt user for package manager preference
   */
  private async promptForPackageManager(): Promise<boolean> {
    try {
      const response = (await prompt({
        type: 'confirm',
        name: 'useExternalPackageManager',
        message: 'Would you like to use your own package manager (npm/yarn/pnpm) instead of Bit?',
        initial: false,
        cancel() {
          // By default, canceling the prompt via Ctrl+c throws an empty string.
          // The custom cancel function prevents that behavior.
          // Otherwise, Bit CLI would print an error and confuse users.
          // See related issue: https://github.com/enquirer/enquirer/issues/225
        },
      } as any)) as { useExternalPackageManager: boolean };

      return response.useExternalPackageManager;
    } catch (err: any) {
      if (!err || err === '') {
        // for some reason, when the user clicks Ctrl+C, the error is an empty string
        throw new Error('The prompt has been canceled');
      }
      throw err;
    }
  }

  /**
   * Create or update .gitignore file with Bit-specific entries
   */
  private async updateGitignore(projectPath: string): Promise<void> {
    const gitignorePath = pathlib.join(projectPath, '.gitignore');
    const bitGitignoreSection = `
# Bit
.bit
public

# Bit files - generated during bit ws-config write command
tsconfig.json
.eslintrc.json
.prettierrc.cjs
# allow tsconfig from the env's config dir to be tracked
!**/config/tsconfig.json
node_modules
`;

    try {
      const exists = await fs.pathExists(gitignorePath);
      if (exists) {
        const content = await fs.readFile(gitignorePath, 'utf8');
        if (!content.includes('# Bit')) {
          await fs.appendFile(gitignorePath, bitGitignoreSection);
        }
      } else {
        await fs.writeFile(gitignorePath, bitGitignoreSection.trim());
      }
    } catch (error: any) {
      // Don't fail the initialization if gitignore update fails
      this.logger.consoleWarning(`Warning: Could not update .gitignore file:, ${error.message}`);
    }
  }

  /**
   * Run interactive mode for Git repositories
   */
  private async runInteractiveMode(projectPath: string): Promise<{
    generator?: string;
    externalPackageManager: boolean;
    defaultDirectory: string;
  }> {
    this.logger.off();
    this.logger.console(chalk.cyan('🔧 Interactive setup for existing Git repository\n'));

    const selectedEnv = await this.promptForEnvironment();
    const useExternalPackageManager = await this.promptForPackageManager();

    await this.updateGitignore(projectPath);

    return {
      generator: selectedEnv || undefined,
      externalPackageManager: useExternalPackageManager,
      defaultDirectory: 'bit-components/{scope}/{name}',
    };
  }

  /**
   * Generate the final initialization message
   */
  private generateInitMessage(
    created: boolean,
    reset: boolean,
    resetHard: boolean,
    resetScope: boolean,
    interactiveConfig: {
      generator?: string;
      externalPackageManager: boolean;
      defaultDirectory: string;
    } | null
  ): string {
    let initMessage = `${chalk.green('successfully initialized a bit workspace.')}`;

    if (!created) initMessage = `${chalk.grey('successfully re-initialized a bit workspace.')}`;
    if (reset) initMessage = `${chalk.grey('your bit workspace has been reset successfully.')}`;
    if (resetHard) initMessage = `${chalk.grey('your bit workspace has been hard-reset successfully.')}`;
    if (resetScope) initMessage = `${chalk.grey('your local scope has been reset successfully.')}`;

    // Add additional information for interactive mode
    if (interactiveConfig) {
      initMessage += `\n\n${chalk.cyan('ℹ️  Additional Information:')}`;
      const defaultDirectory = interactiveConfig?.defaultDirectory || 'bit-components/{scope}/{name}';
      initMessage += `\n📁 Components will be created in: ${chalk.cyan(defaultDirectory)}`;
      initMessage += `\n📖 For CI/CD setup, visit: ${chalk.underline('https://bit.dev/docs/getting-started/collaborate/exporting-components#custom-ci/cd-setup')}`;

      if (interactiveConfig.generator) {
        initMessage += `\n🎯 Environment: ${chalk.cyan(interactiveConfig.generator)}`;
      }

      if (interactiveConfig.externalPackageManager) {
        initMessage += `\n📦 External package manager mode enabled`;
        initMessage += `\n💡 Run ${chalk.cyan('pnpm install')} (or ${chalk.cyan('yarn install')}/${chalk.cyan('npm install')}) to install dependencies`;
      } else if (interactiveConfig.generator) {
        initMessage += `\n💡 Run ${chalk.cyan('bit install')} to install dependencies`;
      }
    }

    return initMessage;
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
      skipInteractive,
    } = flags;
    if (path) path = pathlib.resolve(path);
    if (bare) {
      if (reset || resetHard) throw new BitError('--reset and --reset-hard flags are not available for bare scope');
      // Handle both cases init --bare and init --bare [scopeName]
      const bareVal = bare === true ? '' : bare;
      await initScope(path, bareVal, shared);
      return `${chalk.green('successfully initialized an empty bare bit scope.')}`;
    }
    if (reset && resetHard) {
      throw new BitError('cannot use both --reset and --reset-hard, please use only one of them');
    }

    const projectPath = path || process.cwd();
    let interactiveConfig: {
      generator?: string;
      externalPackageManager: boolean;
      defaultDirectory: string;
    } | null = null;

    // Check if this is a Git repository and run interactive mode
    if (
      !reset &&
      !resetNew &&
      !resetLaneNew &&
      !resetHard &&
      !resetScope &&
      !standalone &&
      !skipInteractive &&
      (await this.hasGitDirectory(projectPath)) &&
      !(await this.hasWorkspaceInitialized(projectPath))
    ) {
      interactiveConfig = await this.runInteractiveMode(projectPath);
    }

    const workspaceExtensionProps: WorkspaceExtensionProps & { externalPackageManager?: boolean } = {
      defaultDirectory:
        interactiveConfig?.defaultDirectory || defaultDirectory || getConfig(CFG_INIT_DEFAULT_DIRECTORY),
      defaultScope: defaultScope || getConfig(CFG_INIT_DEFAULT_SCOPE),
      name,
      externalPackageManager: interactiveConfig?.externalPackageManager || externalPackageManager,
    };

    const { created } = await HostInitializerMain.init(
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
      interactiveConfig?.generator || generator
    );

    return this.generateInitMessage(created, reset, resetHard, resetScope, interactiveConfig);
  }
}
