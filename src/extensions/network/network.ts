import os from 'os';
import path from 'path';
import hash from 'object-hash';
import v4 from 'uuid';
import filenamify from 'filenamify';
import { flatten, filter, uniq, concat, map, equals } from 'ramda';
import capsuleOrchestrator from './orchestrator/orchestrator';
import { BitId } from '../../bit-id';
import { WorkspaceCapsules } from './types';
import { Component, ComponentID } from '../component';
import ConsumerComponent from '../../consumer/component';
import { CapsuleOrchestrator } from './orchestrator/orchestrator';
import { ComponentCapsule } from '../capsule/component-capsule';
import { CapsuleOptions, CreateOptions } from './orchestrator/types';
import { PackageManager } from '../package-manager';
import { Capsule } from '../capsule';
import Consumer from '../../consumer/consumer';
import { getComponentLinks } from '../../links/link-generator';
import { getManipulateDirForComponentWithDependencies } from '../../consumer/component-ops/manipulate-dir';

import { ComponentWithDependencies, loadScope } from '../../scope';
import { loadConsumerIfExist } from '../../consumer';
import ManyComponentsWriter, { ManyComponentsWriterParams } from '../../consumer/component-ops/many-components-writer';

import CapsuleList from './capsule-list';
import CapsulePaths from './capsule-paths';
import Graph from '../../scope/graph/graph'; // TODO: use graph extension?

export type NetworkDeps = [PackageManager, Capsule];

const DEFAULT_ISOLATION_OPTIONS: CapsuleOptions = {
  baseDir: os.tmpdir(),
  writeDists: true,
  writeBitDependencies: true,
  installPackages: true,
  workspace: 'string',
  alwaysNew: false
};

const DEFAULT_OPTIONS = {
  alwaysNew: false
};

export type Options = {
  alwaysNew: boolean;
  name?: string;
};

export type SubNetwork = {
  capsules: CapsuleList;
  components: Graph;
};

function findSuccessorsInGraph(graph, seeders) {
  const depenenciesFromAllIds = flatten(seeders.map(bitId => graph.getSuccessorsByEdgeTypeRecursively(bitId)));
  const components: ConsumerComponent[] = filter(
    val => val,
    uniq(concat(depenenciesFromAllIds, seeders)).map((id: string) => graph.node(id))
  );
  return components;
}

export default class Network {
  constructor(
    /**
     * instance of the capsule orchestrator.
     */
    private packageManager: PackageManager,
    private capsule: Capsule,
    public workspaceName: string = 'any'
  ) {}

  /**
   * create a new network of capsules from a component.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async createSubNetwork(seeders: string[], consumer: Consumer, config?: CapsuleOptions): Promise<SubNetwork> {
    // TODO: consolidate these in the orchestrator
    const actualCapsuleOptions = Object.assign({}, DEFAULT_ISOLATION_OPTIONS, config, {
      workspace: (config && config.workspace) || this.workspaceName
    });
    const orchestrationOptions = {
      alwaysNew: (config && config.alwaysNew) || false,
      name: (config && config.name) || undefined
    };
    const orchOptions = Object.assign({}, DEFAULT_OPTIONS, orchestrationOptions);

    const graph = await Graph.buildGraphFromWorkspace(consumer);
    const components = findSuccessorsInGraph(graph, seeders);
    const capsules = await this.createCapsulesFromComponents(components, actualCapsuleOptions, orchOptions);
    const capsuleList = new CapsuleList(...capsules.map(c => ({ id: c.bitId, value: c })));

    await this.writeComponentFilesToCapsules(components, graph, this._buildCapsulePaths(capsules), capsuleList);
    if (actualCapsuleOptions.installPackages && actualCapsuleOptions.packageManager) {
      await this.packageManager.runInstall(capsules, {
        packageManager: actualCapsuleOptions.packageManager
      });
    } else if (actualCapsuleOptions.installPackages) {
      await this.packageManager.runInstall(capsules);
    }

    return {
      capsules: capsuleList,
      components: graph
    };
  }
  async createSubNetworkFromScope(seeders: string[], config?: CapsuleOptions): Promise<SubNetwork> {
    const actualCapsuleOptions = Object.assign({}, DEFAULT_ISOLATION_OPTIONS, config);
    const orchestrationOptions = {
      alwaysNew: (config && config.alwaysNew) || false,
      name: (config && config.name) || undefined
    };
    const orchOptions = Object.assign({}, DEFAULT_OPTIONS, orchestrationOptions);
    const scope = await loadScope(process.cwd());

    const graph = await Graph.buildGraphFromScope(scope);
    const components = findSuccessorsInGraph(graph, seeders);
    const capsules = await this.createCapsulesFromComponents(components, actualCapsuleOptions, orchOptions);
    const capsuleList = new CapsuleList(...capsules.map(c => ({ id: c.bitId, value: c })));

    await this.writeComponentFilesToCapsules(components, graph, this._buildCapsulePaths(capsules), capsuleList);

    if (actualCapsuleOptions.installPackages) {
      if (actualCapsuleOptions.packageManager) {
        await this.packageManager.runInstall(capsules, {
          packageManager: actualCapsuleOptions.packageManager
        });
      } else {
        await this.packageManager.runInstall(capsules);
      }
    }
    return {
      capsules: capsuleList,
      components: graph
    };
  }
  private async createCapsulesFromComponents(
    components: any[],
    capsuleOptions,
    orchOptions
  ): Promise<ComponentCapsule[]> {
    const capsules: ComponentCapsule[] = await Promise.all(
      map((component: Component) => {
        return this.capsule.create(component.id, capsuleOptions, orchOptions);
      }, components)
    );
    return capsules;
  }
  /**
   * list all of the existing workspace capsules.
   */
  list(): ComponentCapsule[] {
    return [];
  }

  private _buildCapsulePaths(capsules: ComponentCapsule[]): CapsulePaths {
    const capsulePaths = capsules.map(componentCapsule => ({
      id: componentCapsule.bitId,
      value: componentCapsule.wrkDir
    }));
    return new CapsulePaths(...capsulePaths);
  }

  async writeComponentFilesToCapsules(
    components: ConsumerComponent[],
    graph: Graph,
    capsulePaths: CapsulePaths,
    capsuleList: CapsuleList
  ) {
    const writeToPath = '.';
    const componentsWithDependencies = components.map(component => {
      const dependencies = component.dependencies.get().map(dep => graph.node(dep.id.toString()));
      const devDependencies = component.devDependencies.get().map(dep => graph.node(dep.id.toString()));
      const compilerDependencies = component.compilerDependencies.get().map(dep => graph.node(dep.id.toString()));
      const testerDependencies = component.testerDependencies.get().map(dep => graph.node(dep.id.toString()));
      return new ComponentWithDependencies({
        component,
        dependencies,
        devDependencies,
        compilerDependencies,
        testerDependencies
      });
    });
    const concreteOpts: ManyComponentsWriterParams = {
      componentsWithDependencies,
      writeToPath,
      override: false,
      writePackageJson: true,
      writeConfig: false,
      writeBitDependencies: true,
      createNpmLinkFiles: false,
      saveDependenciesAsComponents: false,
      writeDists: false,
      installNpmPackages: false,
      installPeerDependencies: false,
      addToRootPackageJson: false,
      verbose: false,
      excludeRegistryPrefix: false,
      silentPackageManagerResult: false,
      isolated: true,
      capsulePaths
    };
    componentsWithDependencies.map(cmp => this._manipulateDir(cmp));
    const manyComponentsWriter = new ManyComponentsWriter(concreteOpts);
    await manyComponentsWriter._populateComponentsFilesToWrite();
    componentsWithDependencies.forEach(componentWithDependencies => {
      const links = getComponentLinks({
        component: componentWithDependencies.component,
        dependencies: componentWithDependencies.allDependencies,
        createNpmLinkFiles: false,
        bitMap: manyComponentsWriter.bitMap
      });
      componentWithDependencies.component.dataToPersist.files = concat(
        links.files,
        componentWithDependencies.component.dataToPersist.files
      );
    });
    // write data to capsule
    await Promise.all(
      manyComponentsWriter.writtenComponents.map(async componentToWrite => {
        const capsule = capsuleList.getValue(componentToWrite.id);
        if (!capsule) return;
        await componentToWrite.dataToPersist.persistAllToCapsule(capsule, { keepExistingCapsule: true });
      })
    );
    return manyComponentsWriter.writtenComponents;
  }

  /**
   * list capsules from all workspaces.
   */
  listAll(): WorkspaceCapsules {
    // @ts-ignore
    return '';
  }

  static async provide(config: any, [packageManager, capsule]: NetworkDeps) {
    return new Network(packageManager, capsule);
  }

  _manipulateDir(componentWithDependencies: ComponentWithDependencies) {
    const allComponents = [componentWithDependencies.component, ...componentWithDependencies.allDependencies];
    const manipulateDirData = getManipulateDirForComponentWithDependencies(componentWithDependencies);
    allComponents.forEach(component => {
      component.stripOriginallySharedDir(manipulateDirData);
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function getPackageJSONInCapsules(capsules: ComponentCapsule[]) {
  const resolvedJsons = await Promise.all(
    capsules.map(async capsule => {
      const packageJsonPath = path.join(capsule.wrkDir, 'package.json');
      let capsuleJson: any = null;
      try {
        capsuleJson = await capsule.fs.promises.readFile(packageJsonPath, { encoding: 'utf8' });
        return JSON.parse(capsuleJson);
        // eslint-disable-next-line no-empty
      } catch (e) {}
      return capsuleJson;
    })
  );
  return resolvedJsons;
}
