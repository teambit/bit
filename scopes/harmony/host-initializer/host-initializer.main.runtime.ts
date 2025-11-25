import fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import { prompt } from 'enquirer';
import { findScopePath } from '@teambit/scope.modules.find-scope-path';
import type { Consumer } from '@teambit/legacy.consumer';
import { getWorkspaceInfo } from '@teambit/workspace.modules.workspace-locator';
import { Scope } from '@teambit/legacy.scope';
import { Repository } from '@teambit/objects';
import { isDirEmpty } from '@teambit/toolbox.fs.is-dir-empty';
import type { WorkspaceExtensionProps } from '@teambit/config';
import { WorkspaceConfig } from '@teambit/config';
import type { SetupOptions, RulesOptions } from '@teambit/mcp.mcp-config-writer';
import { McpConfigWriter } from '@teambit/mcp.mcp-config-writer';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect, MainRuntime } from '@teambit/cli';
import { ObjectsWithoutConsumer } from './objects-without-consumer';
import { HostInitializerAspect } from './host-initializer.aspect';
import { InitCmd } from './init-cmd';
import { createConsumer, resetConsumer } from './create-consumer';
import type { LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';

export interface InteractiveConfig {
  generator?: string;
  externalPackageManager: boolean;
  defaultDirectory: string;
  mcpEditor?: string;
}

/**
 * Reusable cancel function for prompts
 * By default, canceling the prompt via Ctrl+c throws an empty string.
 * The custom cancel function prevents that behavior.
 * Otherwise, Bit CLI would print an error and confuse users.
 * See related issue: https://github.com/enquirer/enquirer/issues/225
 */
const promptCancel = () => {
  // Empty function to prevent default behavior
};

/**
 * Handle prompt errors consistently
 */
const handlePromptError = (err: any): never => {
  if (!err || err === '') {
    // for some reason, when the user clicks Ctrl+C, the error is an empty string
    throw new Error('The prompt has been canceled');
  }
  throw err;
};

export class HostInitializerMain {
  static async init(
    absPath?: string,
    noGit = false,
    noPackageJson = false,
    reset = false,
    resetNew = false,
    resetLaneNew = false,
    resetHard = false,
    resetScope = false,
    force = false,
    workspaceConfigProps: WorkspaceExtensionProps = {},
    generator?: string
  ): Promise<{ created: boolean; consumer: Consumer }> {
    const consumerInfo = await getWorkspaceInfo(absPath || process.cwd());
    // if "bit init" was running without any flags, the user is probably trying to init a new workspace but wasn't aware
    // that he's already in a workspace.
    if (
      !absPath &&
      consumerInfo?.path &&
      consumerInfo.path !== process.cwd() &&
      !reset &&
      !resetHard &&
      !resetScope &&
      !resetNew &&
      !resetLaneNew
    ) {
      throw new Error(
        `error: unable to init a new workspace in an inner directory of an existing workspace at "${consumerInfo.path}"`
      );
    }
    const consumerPath = consumerInfo?.path || absPath || process.cwd();

    workspaceConfigProps = {
      ...workspaceConfigProps,
      name: workspaceConfigProps.name || path.basename(consumerPath),
    };

    if (reset || resetHard) {
      await resetConsumer(consumerPath, resetHard, noGit);
    }
    let consumer: Consumer | undefined;
    try {
      consumer = await createConsumer(consumerPath, noGit, noPackageJson, workspaceConfigProps, generator);
    } catch {
      // it's possible that at this stage the consumer fails to load due to scope issues.
      // still we want to load it to include its instance of "scope.json", so then later when "consumer.write()", we
      // don't lose some scope metadata
    }
    if (resetScope) {
      const scopePath = findScopePath(consumerPath);
      if (!scopePath) throw new Error(`fatal: scope not found in the path: ${consumerPath}`);
      await Scope.reset(scopePath, true);
    }
    if (!consumer) consumer = await createConsumer(consumerPath, noGit, noPackageJson, workspaceConfigProps);
    if (!force && !resetScope) {
      await throwForOutOfSyncScope(consumer);
    }
    if (resetNew) {
      await consumer.resetNew();
    }
    if (resetLaneNew) {
      await consumer.resetLaneNew();
    }
    const writtenConsumer = await consumer.write();
    return { created: !consumerInfo?.path, consumer: writtenConsumer };
  }

  /**
   * Check if the directory contains a .git folder
   */
  static async hasGitDirectory(projectPath: string): Promise<boolean> {
    try {
      const gitPath = path.join(projectPath, '.git');
      const stat = await fs.stat(gitPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Check if the directory already has a bit workspace initialized
   */
  static async hasWorkspaceInitialized(projectPath: string): Promise<boolean> {
    try {
      const isExist = await WorkspaceConfig.isExist(projectPath);
      return Boolean(isExist);
    } catch {
      return false;
    }
  }

  /**
   * Prompt user for environment selection
   */
  static async promptForEnvironment(): Promise<string | null> {
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
        cancel: promptCancel,
      } as any)) as { environment: string };

      return response.environment === 'none' ? null : response.environment;
    } catch (err: any) {
      return handlePromptError(err);
    }
  }

  /**
   * Prompt user for package manager preference
   */
  static async promptForPackageManager(): Promise<boolean> {
    try {
      const response = (await prompt({
        type: 'confirm',
        name: 'useExternalPackageManager',
        message: 'Would you like to use your own package manager (npm/yarn/pnpm) instead of Bit?',
        initial: false,
        cancel: promptCancel,
      } as any)) as { useExternalPackageManager: boolean };

      return response.useExternalPackageManager;
    } catch (err: any) {
      return handlePromptError(err);
    }
  }

  /**
   * Prompt user for MCP server configuration
   */
  static async promptForMcpServer(): Promise<string | null> {
    try {
      const setupMcp = (await prompt({
        type: 'confirm',
        name: 'setupMcp',
        message: 'Would you like to set up the MCP server for AI-powered development?',
        initial: false,
        cancel: promptCancel,
      } as any)) as { setupMcp: boolean };

      if (!setupMcp.setupMcp) {
        return null;
      }

      const editorChoices = [
        { name: 'vscode', message: 'VS Code' },
        { name: 'cursor', message: 'Cursor' },
        { name: 'windsurf', message: 'Windsurf' },
        { name: 'roo', message: 'Roo Code' },
        { name: 'cline', message: 'Cline' },
        { name: 'claude-code', message: 'Claude Code' },
      ];

      const editorResponse = (await prompt({
        type: 'select',
        name: 'editor',
        message: 'Which editor would you like to configure?',
        choices: editorChoices,
        initial: 0, // Default to VS Code
        cancel: promptCancel,
      } as any)) as { editor: string };

      return editorResponse.editor;
    } catch (err: any) {
      return handlePromptError(err);
    }
  }

  /**
   * Create or update .gitignore file with Bit-specific entries
   */
  static async updateGitignore(projectPath: string): Promise<void> {
    const gitignorePath = path.join(projectPath, '.gitignore');
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
    } catch {
      // Don't fail the initialization if gitignore update fails
      // Note: Console logging is handled by the caller
    }
  }

  /**
   * Set up MCP server configuration for the selected editor
   */
  static async setupMcpServer(editor: string, projectPath: string): Promise<void> {
    // Set up MCP server configuration
    const setupOptions: SetupOptions = {
      isGlobal: false,
      workspaceDir: projectPath,
      consumerProject: false,
    };

    await McpConfigWriter.setupEditor(editor, setupOptions);

    // Write rules file for the editor
    const rulesOptions: RulesOptions = {
      isGlobal: false,
      workspaceDir: projectPath,
      consumerProject: false,
    };

    await McpConfigWriter.writeRulesFile(editor, rulesOptions);
  }

  /**
   * Run interactive mode for Git repositories
   */
  static async runInteractiveMode(projectPath: string): Promise<InteractiveConfig> {
    const selectedEnv = await HostInitializerMain.promptForEnvironment();
    const useExternalPackageManager = await HostInitializerMain.promptForPackageManager();
    const mcpEditor = await HostInitializerMain.promptForMcpServer();

    // Set up MCP server if user selected an editor
    if (mcpEditor) {
      await HostInitializerMain.setupMcpServer(mcpEditor, projectPath);
    }

    await HostInitializerMain.updateGitignore(projectPath);

    return {
      generator: selectedEnv || undefined,
      externalPackageManager: useExternalPackageManager,
      defaultDirectory: 'bit-components/{scope}/{name}',
      mcpEditor: mcpEditor || undefined,
    };
  }

  /**
   * Generate the final initialization message
   */
  static generateInitMessage(
    created: boolean,
    reset: boolean,
    resetHard: boolean,
    resetScope: boolean,
    interactiveConfig: InteractiveConfig | null
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

      if (interactiveConfig.mcpEditor) {
        initMessage += `\n🤖 MCP server configured for: ${chalk.cyan(interactiveConfig.mcpEditor)}`;
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

  static slots = [];
  static dependencies = [CLIAspect, LoggerAspect];
  static runtime = MainRuntime;
  static async provider([cli, loggerMain]: [CLIMain, LoggerMain]) {
    const logger = loggerMain.createLogger(HostInitializerAspect.id);
    const hostInitializerMain = new HostInitializerMain();
    const initCmd = new InitCmd(hostInitializerMain, logger);
    cli.register(initCmd);
    return hostInitializerMain;
  }
}

HostInitializerAspect.addRuntime(HostInitializerMain);

export default HostInitializerMain;

/**
 * throw an error when .bitmap is empty but a scope has objects.
 * a user may got into this state for reasons such as:
 * 1. deleting manually .bitmap hoping to re-start Bit from scratch. (probably unaware of `--reset-hard` flag).
 * 2. switching to a branch where Bit wasn't initialized
 * in which case, it's better to stop and show an error describing what needs to be done.
 * it can always be ignored by entering `--force` flag.
 */
async function throwForOutOfSyncScope(consumer: Consumer): Promise<void> {
  if (!consumer.bitMap.isEmpty()) return;
  const scopePath = consumer.scope.getPath();
  const objectsPath = Repository.getPathByScopePath(scopePath);
  const dirExist = await fs.pathExists(objectsPath);
  if (!dirExist) return;
  const hasObjects = !(await isDirEmpty(objectsPath));
  if (hasObjects) {
    throw new ObjectsWithoutConsumer(scopePath);
  }
}
