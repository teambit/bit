import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import type { Component } from '@teambit/component';
import { ComponentAspect, ComponentMain } from '@teambit/component';
import type { EnvsMain, EnvDefinition } from '@teambit/envs';
import { EnvsAspect } from '@teambit/envs';
import type { Logger, LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import chalk from 'chalk';
import { groupBy } from 'lodash';
import { execSync } from 'child_process';
import { ScriptsAspect } from './scripts.aspect';
import { ScriptsService } from './scripts.service';
import { ScriptCmd } from './script.cmd';
import { ScriptNotFound } from './exceptions';
import type { Scripts } from './scripts';
import type { ScriptHandler } from './script-definition';

export class ScriptsMain {
  constructor(
    private workspace: Workspace,
    private envs: EnvsMain,
    private logger: Logger,
    private componentAspect: ComponentMain
  ) {}

  /**
   * Run a script for all components
   */
  async runScript(scriptName: string): Promise<string> {
    const components = await this.getComponents();
    if (!components.length) {
      return chalk.yellow('no components found');
    }

    // Group components by environment
    const componentsByEnv = this.groupComponentsByEnv(components);
    const results: string[] = [];

    for (const [envId, envComponents] of Object.entries(componentsByEnv)) {
      const env = this.envs.getEnvDefinitionByStringId(envId);
      if (!env) continue;

      const scripts = this.getScriptsFromEnv(env);
      if (!scripts) continue;

      if (!scripts.has(scriptName)) {
        throw new ScriptNotFound(scriptName, envId);
      }

      const handler = scripts.get(scriptName);
      if (!handler) continue;

      const title = chalk.green(
        `\nRunning script "${scriptName}" for ${envComponents.length} component(s) with env ${envId}:`
      );
      results.push(title);

      const result = await this.executeScript(handler, envComponents);
      results.push(result);
    }

    return results.join('\n');
  }

  /**
   * List all available scripts from all environments
   */
  async listAllScripts(): Promise<string> {
    const components = await this.getComponents();
    if (!components.length) {
      return chalk.yellow('no components found');
    }

    const componentsByEnv = this.groupComponentsByEnv(components);
    const results: string[] = [];

    results.push(chalk.green('Available scripts:\n'));

    for (const [envId, envComponents] of Object.entries(componentsByEnv)) {
      const env = this.envs.getEnvDefinitionByStringId(envId);
      if (!env) continue;

      const scripts = this.getScriptsFromEnv(env);
      if (!scripts || scripts.isEmpty()) {
        continue;
      }

      results.push(chalk.cyan(`\nEnvironment: ${envId}`));
      results.push(chalk.gray(`  (used by ${envComponents.length} component(s))`));

      const scriptsList = scripts.list();
      scriptsList.forEach((scriptName) => {
        const handler = scripts.get(scriptName);
        const handlerStr = typeof handler === 'function' ? chalk.gray('[function]') : chalk.white(handler as string);
        results.push(`  ${chalk.bold(scriptName)}: ${handlerStr}`);
      });
    }

    return results.join('\n');
  }

  private async getComponents(): Promise<Component[]> {
    const host = this.componentAspect.getHost();
    if (!host) throw new Error('workspace not found');
    return host.list();
  }

  private groupComponentsByEnv(components: Component[]): Record<string, Component[]> {
    const grouped = groupBy(components, (component) => {
      const env = this.envs.getOrCalculateEnv(component);
      return env.id;
    });
    return grouped;
  }

  private getScriptsFromEnv(env: EnvDefinition): Scripts | undefined {
    if (!env.env.getScripts) return undefined;
    return env.env.getScripts();
  }

  private async executeScript(handler: ScriptHandler, components: Component[]): Promise<string> {
    if (typeof handler === 'string') {
      // Execute shell command
      return this.executeShellCommand(handler);
    }

    // Execute function
    return this.executeFunction(handler, components);
  }

  private executeShellCommand(command: string): string {
    try {
      const output = execSync(command, {
        cwd: this.workspace.path,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      return chalk.white(output);
    } catch (error: any) {
      const errorMsg = error.stderr || error.message || 'unknown error';
      return chalk.red(`Error executing script: ${errorMsg}`);
    }
  }

  private async executeFunction(handler: () => void | Promise<void>, _components: Component[]): Promise<string> {
    try {
      await handler();
      return chalk.green('✓ Script function executed successfully');
    } catch (error: any) {
      return chalk.red(`Error executing script function: ${error.message}`);
    }
  }

  static slots = [];

  static dependencies = [CLIAspect, WorkspaceAspect, EnvsAspect, ComponentAspect, LoggerAspect];

  static runtime = MainRuntime;

  static async provider([cli, workspace, envs, componentAspect, loggerMain]: [
    CLIMain,
    Workspace,
    EnvsMain,
    ComponentMain,
    LoggerMain,
  ]) {
    const logger = loggerMain.createLogger(ScriptsAspect.id);
    const scriptsService = new ScriptsService();
    const scriptsMain = new ScriptsMain(workspace, envs, logger, componentAspect);

    // Register service with envs
    envs.registerService(scriptsService);

    // Register CLI command
    const scriptCmd = new ScriptCmd(scriptsMain);
    cli.register(scriptCmd);

    return scriptsMain;
  }
}

ScriptsAspect.addRuntime(ScriptsMain);

export default ScriptsMain;
