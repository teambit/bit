import Vinyl from 'vinyl';
import fs from 'fs-extra';
import pMapSeries from 'p-map-series';
import path from 'path';
import { Workspace } from '@teambit/workspace';
import { EnvsMain } from '@teambit/envs';
import camelcase from 'camelcase';
import { PathOsBasedRelative } from '@teambit/legacy/dist/utils/path';
import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
import DataToPersist from '@teambit/legacy/dist/consumer/component/sources/data-to-persist';
import { composeComponentPath } from '@teambit/legacy/dist/utils/bit/compose-component-path';
import { ComponentID } from '@teambit/component-id';
import { ComponentTemplate, ComponentFile } from './component-template';
import { CreateOptions } from './create.cmd';

export type GenerateResult = { id: ComponentID; dir: string; files: string[]; envId: string };

export class ComponentGenerator {
  constructor(
    private workspace: Workspace,
    private componentIds: ComponentID[],
    private options: CreateOptions,
    private template: ComponentTemplate,
    private envs: EnvsMain
  ) {}

  async generate(): Promise<GenerateResult[]> {
    const dirsToDeleteIfFailed: string[] = [];
    const generateResults = await pMapSeries(this.componentIds, async (componentId) => {
      try {
        const componentPath = this.getComponentPath(componentId);
        if (fs.existsSync(path.join(this.workspace.path, componentPath))) {
          throw new Error(`unable to create a component at "${componentPath}", this path already exist`);
        }
        dirsToDeleteIfFailed.push(componentPath);
        return await this.generateOneComponent(componentId, componentPath);
      } catch (err) {
        await this.deleteGeneratedComponents(dirsToDeleteIfFailed);
        throw err;
      }
    });

    await this.workspace.consumer.writeBitMap();

    return generateResults;
  }

  private async deleteGeneratedComponents(dirs: string[]) {
    await Promise.all(
      dirs.map(async (dir) => {
        const absoluteDir = path.join(this.workspace.path, dir);
        try {
          await fs.remove(absoluteDir);
        } catch (err) {
          if (err.code !== 'ENOENT') {
            // if not exist, it's fine
            throw err;
          }
        }
      })
    );
  }

  private async generateOneComponent(componentId: ComponentID, componentPath: string): Promise<GenerateResult> {
    const name = componentId.name;
    const namePascalCase = camelcase(name, { pascalCase: true });
    const nameCamelCase = camelcase(name);
    const files = this.template.generateFiles({ name, namePascalCase, nameCamelCase, componentId });
    const mainFile = files.find((file) => file.isMain);
    await this.writeComponentFiles(componentPath, files);
    const addResults = await this.workspace.track({
      rootDir: componentPath,
      mainFile: mainFile?.relativePath,
      componentName: componentId.fullName,
    });
    const component = await this.workspace.get(componentId);
    const env = this.envs.getEnv(component);
    return {
      id: componentId,
      dir: componentPath,
      files: addResults.files,
      envId: env.id,
    };
  }

  /**
   * writes the generated template files to the default directory set in the workspace config
   */
  private async writeComponentFiles(
    componentPath: string,
    templateFiles: ComponentFile[]
  ): Promise<PathOsBasedRelative[]> {
    const dataToPersist = new DataToPersist();
    const vinylFiles = templateFiles.map((templateFile) => {
      const templateFileVinyl = new Vinyl({
        base: componentPath,
        path: path.join(componentPath, templateFile.relativePath),
        contents: Buffer.from(templateFile.content),
      });
      return AbstractVinyl.fromVinyl(templateFileVinyl);
    });
    const results = vinylFiles.map((v) => v.path);
    dataToPersist.addManyFiles(vinylFiles);
    dataToPersist.addBasePath(this.workspace.path);
    await dataToPersist.persistAllToFS();
    return results;
  }

  private getComponentPath(componentId: ComponentID) {
    if (this.options.path) return path.join(this.options.path, componentId.fullName);
    return composeComponentPath(componentId._legacy.changeScope(componentId.scope), this.workspace.defaultDirectory);
  }
}
