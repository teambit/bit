import Vinyl from 'vinyl';
import fs from 'fs-extra';
import pMapSeries from 'p-map-series';
import { init } from '@teambit/legacy/dist/api/consumer';
import path from 'path';
import { Workspace } from '@teambit/workspace';
import { EnvsMain } from '@teambit/envs';
import camelcase from 'camelcase';
import { PathOsBasedRelative } from '@teambit/legacy/dist/utils/path';
import { addFeature, HARMONY_FEATURE } from '@teambit/legacy/dist/api/consumer/lib/feature-toggle';
import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
import DataToPersist from '@teambit/legacy/dist/consumer/component/sources/data-to-persist';
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
    const consumer = await init(workspacePath, this.options.standalone, false, false, false, false, {});
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
