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
import { CLIAspect, MainRuntime, formatSuccessSummary, formatHint, formatTitle } from '@teambit/cli';
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
    generator?: string,
    agent?: string
  ): Promise<{ created: boolean; consumer: Consumer; agentFileWritten?: string }> {
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
    const created = !consumerInfo?.path;
    let agentFileWritten: string | undefined;
    if (created) {
      agentFileWritten = await HostInitializerMain.writeAgentInstructions(consumerPath, agent);
    }
    return { created, consumer: writtenConsumer, agentFileWritten };
  }

  /**
   * Supported agent targets and their output file paths (relative to workspace root).
   */
  static readonly AGENT_FILE_MAP: Record<string, string> = {
    claude: 'CLAUDE.md',
    cursor: '.cursor/rules/bit.mdc',
    copilot: '.github/copilot-instructions.md',
  };

  /**
   * All known agent instruction file paths. Used to detect whether a workspace
   * already contains any agent configuration.
   */
  static readonly ALL_AGENT_FILES = [
    'AGENTS.md',
    'CLAUDE.md',
    '.cursorrules',
    '.cursor/rules',
    '.github/copilot-instructions.md',
  ];

  /**
   * Write AI agent instructions into the workspace.
   *
   * - Skips if .git exists (git repos use the interactive init flow).
   * - Skips if any known agent instruction file already exists.
   * - When `agent` is provided, writes to the tool-specific path (e.g. CLAUDE.md).
   * - When `agent` is omitted, writes the universal AGENTS.md.
   *
   * Returns the relative path of the file written, or undefined if skipped.
   */
  static async writeAgentInstructions(
    projectPath: string,
    agent?: string,
    skipGitCheck = false
  ): Promise<string | undefined> {
    if (agent && !HostInitializerMain.AGENT_FILE_MAP[agent]) {
      const supported = Object.keys(HostInitializerMain.AGENT_FILE_MAP).join(', ');
      throw new Error(`unknown --agent value "${agent}". supported values: ${supported}`);
    }
    try {
      // Don't write in git repos — they use the interactive flow.
      // Callers like `bit new` set skipGitCheck because they always create a fresh workspace.
      if (!skipGitCheck && (await HostInitializerMain.hasGitDirectory(projectPath))) return undefined;

      // Don't write if any agent file already exists.
      if (await HostInitializerMain.hasExistingAgentFile(projectPath)) return undefined;

      const targetFile = agent ? HostInitializerMain.AGENT_FILE_MAP[agent] : 'AGENTS.md';
      const targetPath = path.join(projectPath, targetFile);

      // Read the shared template content.
      const templatePath = path.join(__dirname, 'agents-template.md');
      const content = await fs.readFile(templatePath, 'utf8');

      // Some formats require frontmatter.
      const finalContent = HostInitializerMain.wrapWithFrontmatter(targetFile, content);

      await fs.ensureDir(path.dirname(targetPath));
      await fs.writeFile(targetPath, finalContent);
      return targetFile;
    } catch {
      // Don't fail initialization if the agent file cannot be written.
      return undefined;
    }
  }

  /**
   * Check if any known agent instruction file or directory already exists.
   */
  static async hasExistingAgentFile(projectPath: string): Promise<boolean> {
    for (const rel of HostInitializerMain.ALL_AGENT_FILES) {
      if (await fs.pathExists(path.join(projectPath, rel))) return true;
    }
    return false;
  }

  /**
   * Wrap template content with tool-specific frontmatter where required.
   */
  static wrapWithFrontmatter(targetFile: string, content: string): string {
    if (targetFile === '.cursor/rules/bit.mdc') {
      return ['---', 'description: Bit workspace instructions', 'alwaysApply: true', '---', '', content].join('\n');
    }
    return content;
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
        type: 'toggle',
        name: 'useExternalPackageManager',
        message: 'Would you like to use your own package manager (npm/yarn/pnpm) instead of Bit?',
        enabled: 'Yes',
        disabled: 'No',
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
        type: 'toggle',
        name: 'setupMcp',
        message: 'Would you like to set up the MCP server for AI-powered development?',
        enabled: 'Yes',
        disabled: 'No',
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
    interactiveConfig: InteractiveConfig | null,
    agentFileWritten?: string
  ): string {
    let initMessage = formatSuccessSummary('initialized a bit workspace.');

    if (!created) initMessage = formatHint('successfully re-initialized a bit workspace.');
    if (reset) initMessage = formatHint('your bit workspace has been reset successfully.');
    if (resetHard) initMessage = formatHint('your bit workspace has been hard-reset successfully.');
    if (resetScope) initMessage = formatHint('your local scope has been reset successfully.');

    if (agentFileWritten) {
      initMessage += formatHint(
        `\n  Created ${chalk.cyan(agentFileWritten)} — instructions for AI agents working in this workspace`
      );
    }

    // Add additional information for interactive mode
    if (interactiveConfig) {
      initMessage += `\n\n${formatTitle('Additional Information')}`;
      const defaultDirectory = interactiveConfig?.defaultDirectory || 'bit-components/{scope}/{name}';
      initMessage += `\n  Components will be created in: ${chalk.cyan(defaultDirectory)}`;
      initMessage += `\n  For CI/CD setup, visit: https://bit.dev/docs/getting-started/collaborate/exporting-components#custom-ci/cd-setup`;

      if (interactiveConfig.generator) {
        initMessage += `\n  Environment: ${chalk.cyan(interactiveConfig.generator)}`;
      }

      if (interactiveConfig.mcpEditor) {
        initMessage += `\n  MCP server configured for: ${chalk.cyan(interactiveConfig.mcpEditor)}`;
      }

      if (interactiveConfig.externalPackageManager) {
        initMessage += `\n  External package manager mode enabled`;
        initMessage += formatHint(
          `\n  Run ${chalk.cyan('pnpm install')} (or ${chalk.cyan('yarn install')}/${chalk.cyan('npm install')}) to install dependencies`
        );
      } else if (interactiveConfig.generator) {
        initMessage += formatHint(`\n  Run ${chalk.cyan('bit install')} to install dependencies`);
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
