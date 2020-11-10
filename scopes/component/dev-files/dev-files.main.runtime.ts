import { MainRuntime } from '@teambit/cli';
import { flatten } from 'lodash';
import { SlotRegistry, Slot } from '@teambit/harmony';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import LegacyComponent from 'bit-bin/dist/consumer/component';
import { DependencyResolver } from 'bit-bin/dist/consumer/component/dependencies/dependency-resolver';
import { Component } from '@teambit/component';
import { DevFilesAspect } from './dev-files.aspect';

/**
 * dev pattern is of type string. an example to a pattern can be "*.spec.ts"
 */
export type DevPatterns = string[];

/**
 * slot for dev file patterns.
 */
export type DevPatternSlot = SlotRegistry<DevPatterns>;

export type DevFilesConfig = {
  patterns: string[];
};

export class DevFilesMain {
  constructor(
    private envs: EnvsMain,

    private devPatternSlot: DevPatternSlot,

    /**
     * configuration loaded into the dev files aspect.
     */
    readonly config: DevFilesConfig
  ) {}

  /**
   * compute all dev patterns on a component.
   * computing of dev patterns is a merge of the configuration, the env (env.getDevPatterns()) and
   * the registering aspects (through registerDevPattern()).
   */
  computeDevPatterns(component: Component) {
    const entry = component.state.aspects.get(DevFilesAspect.id);
    const configuredPatterns = entry?.config.devFilePatterns || [];
    const envDef = this.envs.getEnv(component);
    const envPatterns: DevPatterns[] = envDef.env?.getDevPatterns ? envDef.env.getDevPatterns() : [];
    const fromSlot = flatten(this.devPatternSlot.values());
    // const configuredOnComponent = fromSlot.filter(([id]) => {
    //   return component.state.aspects.get(id);
    // });
    // const slotPatternsOnComponent = configuredOnComponent.map(([, pattern]) => pattern);

    return fromSlot.concat(configuredPatterns).concat(envPatterns);
  }

  /**
   * get all dev files configured on a component.
   */
  getDevPatterns(component: Component) {
    const entry = component.state.aspects.get(DevFilesAspect.id);
    const devPatterns = entry?.data.devPatterns || [];
    return devPatterns;
  }

  /**
   * determine whether a file of a component is a dev file.
   */
  isDevFile(component: Component, filePath: string): boolean {
    const devFiles = this.computeDevFiles(component);
    return devFiles.includes(filePath);
  }

  /**
   * register a new dev pattern.
   * @param regex dev pattern
   */
  registerDevPattern(pattern: DevPatterns) {
    return this.devPatternSlot.register(pattern);
  }

  /**
   * get all dev patterns registered.
   */
  getDevFiles(component: Component): string[] {
    const entry = component.state.aspects.get(DevFilesAspect.id);
    const devFiles = entry?.data.devFiles || [];
    return devFiles;
  }

  /**
   * compute all dev files of a component.
   */
  computeDevFiles(component: Component) {
    const devPatterns = this.computeDevPatterns(component);
    const devFiles = component.state.filesystem.byGlob(devPatterns).map((file) => file.relative);

    return devFiles;
  }

  static slots = [Slot.withType<DevPatterns>()];

  static defaultConfig = {
    patterns: [],
  };

  static runtime = MainRuntime;

  static dependencies = [EnvsAspect, WorkspaceAspect];

  static async provider(
    [envs, workspace]: [EnvsMain, Workspace],
    config: DevFilesConfig,
    [devPatternSlot]: [DevPatternSlot]
  ) {
    const devFiles = new DevFilesMain(envs, devPatternSlot, config);
    if (workspace) {
      DependencyResolver.isDevFile = async (consumerComponent: LegacyComponent, file: string) => {
        const component = await workspace.get(
          await workspace.resolveComponentId(consumerComponent.id),
          false,
          consumerComponent
        );
        if (!component) throw Error(`failed to transform component ${consumerComponent.id.toString()} in harmony`);
        return devFiles.isDevFile(component, file);
      };
    }

    return devFiles;
  }
}

DevFilesAspect.addRuntime(DevFilesMain);
