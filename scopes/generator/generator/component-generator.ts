import Vinyl from 'vinyl';
import fs from 'fs-extra';
import pMapSeries from 'p-map-series';
import path from 'path';
import { Workspace } from '@teambit/workspace';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import camelcase from 'camelcase';
import { BitError } from '@teambit/bit-error';
import { Logger } from '@teambit/logger';
import { TrackerMain } from '@teambit/tracker';
import { linkToNodeModulesByIds } from '@teambit/workspace.modules.node-modules-linker';
import { PathOsBasedRelative } from '@teambit/legacy.utils';
import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
import { componentIdToPackageName } from '@teambit/legacy.utils';
import DataToPersist from '@teambit/legacy/dist/consumer/component/sources/data-to-persist';
import { NewComponentHelperMain } from '@teambit/new-component-helper';
import { ComponentID } from '@teambit/component-id';
import { WorkspaceConfigFilesMain } from '@teambit/workspace-config-files';

import { ComponentTemplate, ComponentFile, ComponentConfig } from './component-template';
import { CreateOptions } from './create.cmd';
import { OnComponentCreateSlot } from './generator.main.runtime';

export type GenerateResult = {
  id: ComponentID;
  dir: string;
  files: string[];
  envId: string;
  envSetBy: string;
  packageName: string;
  isApp?: boolean;
  isEnv?: boolean;
  dependencies?: string[];
  installMissingDependencies?: boolean;
};

export type OnComponentCreateFn = (generateResults: GenerateResult[]) => Promise<void>;

export class ComponentGenerator {
  constructor(
    private workspace: Workspace,
    private componentIds: ComponentID[],
    private options: Partial<CreateOptions>,
    private template: ComponentTemplate,
    private envs: EnvsMain,
    private newComponentHelper: NewComponentHelperMain,
    private tracker: TrackerMain,
    private wsConfigFiles: WorkspaceConfigFilesMain,
    private logger: Logger,
    private onComponentCreateSlot: OnComponentCreateSlot,
    private aspectId: string,
    private envId?: ComponentID
  ) {}

  async generate(force = false): Promise<GenerateResult[]> {
    const dirsToDeleteIfFailed: string[] = [];
    const generateResults = await pMapSeries(this.componentIds, async (componentId) => {
      try {
        const componentPath = this.newComponentHelper.getNewComponentPath(componentId, {
          pathFromUser: this.options.path,
          componentsToCreate: this.componentIds.length,
        });
        if (!force && fs.existsSync(path.join(this.workspace.path, componentPath))) {
          throw new BitError(
            `unable to create a component at "${componentPath}", this path already exists, please use "--path" to create the component in a different path`
          );
        }
        dirsToDeleteIfFailed.push(componentPath);
        return await this.generateOneComponent(componentId, componentPath);
      } catch (err: any) {
        await this.deleteGeneratedComponents(dirsToDeleteIfFailed);
        throw err;
      }
    });

    await this.workspace.bitMap.write(`create (${this.componentIds.length} components)`);

    const ids = generateResults.map((r) => r.id);
    await this.tryLinkToNodeModules(ids);
    await this.runOnComponentCreateHook(generateResults);
    // We are running this after the runOnComponentCreateHook as it require
    // the env to be installed to work properly, and the hook might install
    // the env.
    await this.tryWriteConfigFiles(ids);

    return generateResults;
  }

  private async tryLinkToNodeModules(ids: ComponentID[]) {
    try {
      await linkToNodeModulesByIds(
        this.workspace,
        ids.map((id) => id)
      );
    } catch (err: any) {
      this.logger.consoleFailure(
        `failed linking the new components to node_modules, please run "bit link" manually. error: ${err.message}`
      );
    }
  }

  private async runOnComponentCreateHook(generateResults: GenerateResult[]) {
    const fns = this.onComponentCreateSlot.values();
    if (!fns.length) return;
    await Promise.all(fns.map((fn) => fn(generateResults)));
  }

  /**
   * The function `tryWriteConfigFiles` attempts to write workspace config files, and if it fails, it logs an error
   * message.
   * @returns If the condition `!shouldWrite` is true, then nothing is being returned. Otherwise, if the `writeConfigFiles`
   * function is successfully executed, nothing is being returned. If an error occurs during the execution of
   * `writeConfigFiles`, an error message is being returned.
   */
  private async tryWriteConfigFiles(ids: ComponentID[]) {
    const shouldWrite = this.wsConfigFiles.isWorkspaceConfigWriteEnabled();
    if (!shouldWrite) return;
    ids.map((id) => this.workspace.clearComponentCache(id));
    const { err } = await this.wsConfigFiles.writeConfigFiles({
      clean: true,
      silent: true,
      dedupe: true,
      throw: false,
    });
    if (err) {
      this.logger.consoleFailure(
        `failed generating workspace config files, please run "bit ws-config write" manually. error: ${err.message}`
      );
    }
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
    const aspectId = ComponentID.fromString(this.aspectId);

    const files = await this.template.generateFiles({
      name,
      namePascalCase,
      nameCamelCase,
      componentId,
      aspectId,
      envId: this.envId,
    });
    const mainFile = files.find((file) => file.isMain);
    await this.writeComponentFiles(componentPath, files);
    const addResults = await this.tracker.track({
      rootDir: componentPath,
      mainFile: mainFile?.relativePath,
      componentName: componentId.fullName,
      defaultScope: this.options.scope,
    });
    const component = await this.workspace.get(componentId);
    const hasEnvConfiguredOriginally = this.envs.hasEnvConfigured(component);
    if (this.template.isApp) {
      await this.workspace.use(componentId.toString());
    }
    const envBeforeConfigChanges = this.envs.getEnv(component);
    let config = this.template.config;
    if (config && typeof config === 'function') {
      const boundConfig = this.template.config?.bind(this.template);
      config = boundConfig({ aspectId: this.aspectId });
    }

    const userEnv = this.options.env;

    if (!config && this.envId && !userEnv) {
      const isInWorkspace = this.workspace.exists(this.envId);
      config = {
        [isInWorkspace ? this.envId.toStringWithoutVersion() : this.envId.toString()]: {},
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
    // eslint-disable-next-line prefer-const
    let { envId, setBy } = getEnvData();
    if (envId) {
      const isInWorkspace = this.workspace.exists(envId);
      const isSameAsThisEnvId = envId === this.envId?.toString() || envId === this.envId?.toStringWithoutVersion();
      if (isSameAsThisEnvId && this.envId) {
        envId = isInWorkspace ? this.envId.toStringWithoutVersion() : this.envId.toString();
      }
    }
    return {
      id: componentId,
      dir: componentPath,
      files: addResults.files,
      packageName: componentIdToPackageName(component.state._consumer),
      envId,
      envSetBy: setBy,
      isApp: this.template.isApp,
      isEnv: this.template.isEnv,
      dependencies: this.template.dependencies,
      installMissingDependencies: this.template.installMissingDependencies,
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
    await this.tracker.addEnvToConfig(userEnv, config);

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
