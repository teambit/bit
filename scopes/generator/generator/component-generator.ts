import Vinyl from 'vinyl';
import fs from 'fs-extra';
import pMapSeries from 'p-map-series';
import path from 'path';
import { Workspace } from '@teambit/workspace';
import EnvsAspect, { EnvsMain } from '@teambit/envs';
import camelcase from 'camelcase';
import { BitError } from '@teambit/bit-error';
import { PathOsBasedRelative } from '@teambit/legacy/dist/utils/path';
import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
import DataToPersist from '@teambit/legacy/dist/consumer/component/sources/data-to-persist';
import { NewComponentHelperMain } from '@teambit/new-component-helper';
import { ComponentID } from '@teambit/component-id';
import { ComponentTemplate, ComponentFile, ComponentConfig } from './component-template';
import { CreateOptions } from './create.cmd';

export type GenerateResult = { id: ComponentID; dir: string; files: string[]; envId: string; envSetBy: string };

export class ComponentGenerator {
  constructor(
    private workspace: Workspace,
    private componentIds: ComponentID[],
    private options: CreateOptions,
    private template: ComponentTemplate,
    private envs: EnvsMain,
    private newComponentHelper: NewComponentHelperMain,
    private aspectId: string,
    private envId?: ComponentID
  ) {}

  async generate(): Promise<GenerateResult[]> {
    const dirsToDeleteIfFailed: string[] = [];
    const generateResults = await pMapSeries(this.componentIds, async (componentId) => {
      try {
        const componentPath = this.newComponentHelper.getNewComponentPath(componentId, this.options.path);
        if (fs.existsSync(path.join(this.workspace.path, componentPath))) {
          throw new BitError(`unable to create a component at "${componentPath}", this path already exist`);
        }
        if (await this.workspace.hasName(componentId.fullName)) {
          throw new BitError(
            `unable to create a component "${componentId.fullName}", a component with the same name already exist`
          );
        }
        dirsToDeleteIfFailed.push(componentPath);
        return await this.generateOneComponent(componentId, componentPath);
      } catch (err: any) {
        await this.deleteGeneratedComponents(dirsToDeleteIfFailed);
        throw err;
      }
    });

    await this.workspace.bitMap.write();

    return generateResults;
  }

  private async deleteGeneratedComponents(dirs: string[]) {
    await Promise.all(
      dirs.map(async (dir) => {
        const absoluteDir = path.join(this.workspace.path, dir);
        try {
          await fs.remove(absoluteDir);
        } catch (err: any) {
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
      defaultScope: this.options.scope,
    });
    const component = await this.workspace.get(componentId);
    const hasEnvConfiguredOriginally = this.envs.hasEnvConfigured(component);
    const envBeforeConfigChanges = this.envs.getEnv(component);

    let config = this.template.config?.bind(this.template);
    if (config && typeof config === 'function') {
      config = config({ aspectId: this.aspectId });
    }

    if (!config && this.envId) {
      config = {
        [this.envId.toString()]: {},
        'teambit.envs/envs': {
          env: this.envId.toStringWithoutVersion(),
        },
      };
    }

    const templateEnv = config?.[EnvsAspect.id]?.env;

    if (config && templateEnv && hasEnvConfiguredOriginally) {
      // remove the env we got from the template.
      delete config[templateEnv];
      delete config[EnvsAspect.id].env;
      if (Object.keys(config[EnvsAspect.id]).length === 0) delete config[EnvsAspect.id];
      if (Object.keys(config).length === 0) config = undefined;
    }

    const configWithEnv = await this.addEnvIfProvidedByFlag(config);
    if (configWithEnv) this.workspace.bitMap.setEntireConfig(component.id, configWithEnv);

    const getEnvData = () => {
      const envFromFlag = this.options.env; // env entered by the user when running `bit create --env`
      const envFromTemplate = config?.[EnvsAspect.id]?.env;
      if (envFromFlag) {
        return {
          envId: envFromFlag,
          setBy: '--env flag',
        };
      }
      if (envFromTemplate) {
        return {
          envId: envFromTemplate,
          setBy: 'template',
        };
      }
      return {
        envId: envBeforeConfigChanges.id,
        setBy: hasEnvConfiguredOriginally ? 'workspace variants' : '<default>',
      };
    };
    const { envId, setBy } = getEnvData();
    return {
      id: componentId,
      dir: componentPath,
      files: addResults.files,
      envId,
      envSetBy: setBy,
    };
  }

  private async addEnvIfProvidedByFlag(config?: ComponentConfig): Promise<ComponentConfig | undefined> {
    const userEnv = this.options.env; // env entered by the user when running `bit create --env`
    const templateEnv = config?.[EnvsAspect.id]?.env;
    if (!userEnv || userEnv === templateEnv) {
      return config;
    }
    config = config || {};
    if (templateEnv) {
      // the component template has an env and the user wants a different env.
      delete config[templateEnv];
    }
    const userEnvId = await this.workspace.resolveComponentId(userEnv);
    const userEnvIdWithPotentialVersion = await this.workspace.resolveEnvIdWithPotentialVersionForConfig(userEnvId);
    config[userEnvIdWithPotentialVersion] = {};
    config[EnvsAspect.id] = config[EnvsAspect.id] || {};
    config[EnvsAspect.id].env = userEnvId.toStringWithoutVersion();
    return config;
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
}
