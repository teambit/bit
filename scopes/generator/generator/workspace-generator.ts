import fs from 'fs-extra';
import { init } from '@teambit/legacy/dist/api/consumer';
import path from 'path';
import { EnvsMain } from '@teambit/envs';
import { addFeature, HARMONY_FEATURE } from '@teambit/legacy/dist/api/consumer/lib/feature-toggle';
import { ComponentID } from '@teambit/component-id';
import { WorkspaceFile, WorkspaceTemplate } from './workspace-template';
import { NewOptions } from './new.cmd';

export type GenerateResult = { id: ComponentID; dir: string; files: string[]; envId: string };

export class WorkspaceGenerator {
  constructor(
    private workspaceName: string,
    private options: NewOptions,
    private template: WorkspaceTemplate,
    private envs: EnvsMain
  ) {}

  async generate(): Promise<string> {
    const workspacePath = path.resolve(this.workspaceName);
    if (fs.existsSync(workspacePath)) {
      throw new Error(`unable to create a workspace at "${this.workspaceName}", this path already exist`);
    }
    await fs.ensureDir(workspacePath);
    addFeature(HARMONY_FEATURE);
    await init(workspacePath, this.options.standalone, false, false, false, false, {});
    const files = this.template.generateFiles({ name: this.workspaceName });
    await this.writeWorkspaceFiles(workspacePath, files);
    return workspacePath;
  }

  /**
   * writes the generated template files to the default directory set in the workspace config
   */
  private async writeWorkspaceFiles(workspacePath: string, templateFiles: WorkspaceFile[]): Promise<void> {
    await Promise.all(
      templateFiles.map(async (templateFile) => {
        await fs.writeFile(path.join(workspacePath, templateFile.relativePath), templateFile.content);
      })
    );
  }
}
