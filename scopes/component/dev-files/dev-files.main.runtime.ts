import { MainRuntime } from '@teambit/cli';
import { flatten } from 'lodash';
import { SlotRegistry, Slot } from '@teambit/harmony';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import LegacyComponent from 'bit-bin/dist/consumer/component';
import { DependencyResolver } from 'bit-bin/dist/consumer/component/dependencies/dependency-resolver';
import { Component, ComponentMain, ComponentAspect } from '@teambit/component';
import { DevFilesAspect } from './dev-files.aspect';
import { DevFiles } from './dev-files';
import { DevFilesFragment } from './dev-files.fragment';

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

    const patternSlot = this.devPatternSlot.toArray();
    const fromSlot: { [id: string]: any } = patternSlot.reduce((acc, current) => {
      const [aspectId, patterns] = current;
      if (!acc[aspectId]) acc[aspectId] = [];
      // if (component.state.aspects.get(aspectId)) acc[aspectId] = acc[aspectId].concat(patterns);
      acc[aspectId] = acc[aspectId].concat(patterns);
      return acc;
    }, {});

    return Object.assign(
      {
        [envDef.id]: envPatterns,
        config: configuredPatterns,
      },
      fromSlot
    );
  }

  /**
   * get all dev files configured on a component.
   */
  getDevPatterns(component: Component, aspectId?: string) {
    const entry = component.state.aspects.get(DevFilesAspect.id);
    const devPatterns = entry?.data.devPatterns || {};
    return aspectId ? devPatterns[aspectId] : flatten(Object.values(devPatterns));
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
  getDevFiles(component: Component): DevFiles {
    const entry = component.state.aspects.get(DevFilesAspect.id);
    const rawDevFiles = entry?.data.devFiles || {};
    return new DevFiles(rawDevFiles);
  }

  /**
   * compute all dev files of a component.
   */
  computeDevFiles(component: Component): DevFiles {
    const devPatterns = this.computeDevPatterns(component);
    const rawDevFiles = Object.keys(devPatterns).reduce((acc, aspectId) => {
      if (!acc[aspectId]) acc[aspectId] = [];
      const patterns = devPatterns[aspectId];
      acc[aspectId] = component.state.filesystem.byGlob(patterns).map((file) => file.relative);
      return acc;
    }, {});

    return new DevFiles(rawDevFiles);
  }

  static slots = [Slot.withType<DevPatterns>()];

  static defaultConfig = {
    patterns: [],
  };

  static runtime = MainRuntime;

  static dependencies = [EnvsAspect, WorkspaceAspect, ComponentAspect];

  static async provider(
    [envs, workspace, componentAspect]: [EnvsMain, Workspace, ComponentMain],
    config: DevFilesConfig,
    [devPatternSlot]: [DevPatternSlot]
  ) {
    const devFiles = new DevFilesMain(envs, devPatternSlot, config);
    componentAspect.registerShowFragments([new DevFilesFragment(devFiles)]);

    if (workspace) {
      workspace.onComponentLoad(async (component) => {
        return {
          devPatterns: devFiles.computeDevPatterns(component),
          devFiles: devFiles.computeDevFiles(component).toObject(),
        };
      });

      DependencyResolver.getDevFiles = async (consumerComponent: LegacyComponent): Promise<string[]> => {
        const componentId = await workspace.resolveComponentId(consumerComponent.id);
        const component = await workspace.get(componentId, false, consumerComponent, true, false);
        if (!component) throw Error(`failed to transform component ${consumerComponent.id.toString()} in harmony`);
        const computedDevFiles = devFiles.computeDevFiles(component);
        return computedDevFiles.list();
      };
    }

    return devFiles;
  }
}

DevFilesAspect.addRuntime(DevFilesMain);
