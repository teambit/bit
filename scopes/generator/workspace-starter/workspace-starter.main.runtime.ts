import fs from 'fs-extra';
import { resolve } from 'path';
import { MainRuntime } from '@teambit/harmony.modules.runtimes';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import type { Component } from '@teambit/component';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { GeneratorMain } from '@teambit/generator';
import { GeneratorAspect } from '@teambit/generator';
import type { DeprecationMain } from '@teambit/deprecation';
import { DeprecationAspect } from '@teambit/deprecation';
import type { Logger, LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import { BitError } from '@teambit/bit-error';
import { WorkspaceStarterAspect } from './workspace-starter.aspect';
import { NewCmd } from './new.cmd';
import type { NewOptions } from './new.cmd';
import { WorkspaceGenerator } from './workspace-generator';
import { WorkspacePathExists } from './exceptions/workspace-path-exists';

export type GenerateWorkspaceTemplateResult = { workspacePath: string; appName?: string };

/**
 * creates new workspaces from the workspace templates (starters) registered to the generator ("bit new").
 * it's separated from the generator because it uses aspects that themselves depend on the generator.
 */
export class WorkspaceStarterMain {
  constructor(
    private generator: GeneratorMain,
    private workspace: Workspace,
    private deprecation: DeprecationMain,
    private logger: Logger
  ) {}

  async generateWorkspaceTemplate(
    workspaceName: string,
    templateName: string,
    options: NewOptions & { aspect?: string; currentDir?: boolean }
  ): Promise<GenerateWorkspaceTemplateResult> {
    if (this.workspace) {
      throw new BitError('Error: unable to generate a new workspace inside of an existing workspace');
    }
    const workspacePath = options.currentDir ? process.cwd() : resolve(workspaceName);
    if (!options.currentDir && fs.existsSync(workspacePath)) {
      throw new WorkspacePathExists(workspacePath);
    }
    const { aspect: aspectId, loadFrom } = options;
    const { workspaceTemplate, aspect } = loadFrom
      ? await this.generator.findTemplateInOtherWorkspace(loadFrom, templateName, aspectId)
      : await this.generator.getWorkspaceTemplate(templateName, aspectId);

    if (!workspaceTemplate) throw new BitError(`template "${templateName}" was not found`);
    const workspaceGenerator = new WorkspaceGenerator(
      workspaceName,
      workspacePath,
      options,
      workspaceTemplate,
      this.generator.getBitApi(),
      aspect
    );
    await this.warnAboutDeprecation(aspect);
    await workspaceGenerator.generate();
    return { workspacePath, appName: workspaceTemplate.appName };
  }

  private async warnAboutDeprecation(aspect?: Component) {
    if (!aspect) return;
    const deprecationInfo = await this.deprecation.getDeprecationInfo(aspect);
    if (deprecationInfo.isDeprecate) {
      const newStarterMsg = deprecationInfo.newId ? `, use "${deprecationInfo.newId.toString()}" instead` : '';
      this.logger.consoleWarning(`the starter "${aspect?.id.toString()}" is deprecated${newStarterMsg}`);
    }
  }

  static slots = [];
  static dependencies = [CLIAspect, GeneratorAspect, WorkspaceAspect, DeprecationAspect, LoggerAspect];
  static runtime = MainRuntime;

  static async provider([cli, generator, workspace, deprecation, loggerMain]: [
    CLIMain,
    GeneratorMain,
    Workspace,
    DeprecationMain,
    LoggerMain,
  ]) {
    const logger = loggerMain.createLogger(WorkspaceStarterAspect.id);
    const workspaceStarter = new WorkspaceStarterMain(generator, workspace, deprecation, logger);
    cli.register(new NewCmd(workspaceStarter));
    return workspaceStarter;
  }
}

WorkspaceStarterAspect.addRuntime(WorkspaceStarterMain);

export default WorkspaceStarterMain;
