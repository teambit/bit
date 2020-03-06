import os from 'os';
import path from 'path';
import hash from 'object-hash';
import v4 from 'uuid';
import filenamify from 'filenamify';
import fs from 'fs-extra';
import { flatten, filter, uniq, concat, map, equals } from 'ramda';
import { BitId } from '../../bit-id';
import { CACHE_ROOT } from '../../constants';
import { Component, ComponentID } from '../component';
import ConsumerComponent from '../../consumer/component';
import { PackageManager } from '../package-manager';
import { Capsule } from './capsule';
import Consumer from '../../consumer/consumer';
import { getComponentLinks } from '../../links/link-generator';
import { getManipulateDirForComponentWithDependencies } from '../../consumer/component-ops/manipulate-dir';

import { ComponentWithDependencies, loadScope } from '../../scope';
import { loadConsumerIfExist } from '../../consumer';
import ManyComponentsWriter, { ManyComponentsWriterParams } from '../../consumer/component-ops/many-components-writer';

import CapsuleList from './capsule-list';
import CapsulePaths from './capsule-paths';
import Graph from '../../scope/graph/graph'; // TODO: use graph extension?

const CAPSULES_BASE_DIR = path.join(CACHE_ROOT, 'capsules'); // TODO: move elsewhere

export type IsolatorDeps = [PackageManager];

export type ListResults = {
  workspace: string;
  capsules: string[];
};

export type Network = {
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

export default class Isolator {
  constructor(private packageManager: PackageManager) {}

  async createNetworkFromConsumer(seeders: string[], consumer: Consumer, opts?: {}): Promise<Network> {
    const graph = await Graph.buildGraphFromWorkspace(consumer);
    const baseDir = path.join(CAPSULES_BASE_DIR, hash(consumer.projectPath)); // TODO: move this logic elsewhere
    return this.createNetwork(seeders, graph, baseDir, opts);
  }
  async createNetworkFromScope(seeders: string[], opts?: {}): Promise<Network> {
    const scope = await loadScope(process.cwd());
    const graph = await Graph.buildGraphFromScope(scope);
    const baseDir = path.join(CAPSULES_BASE_DIR, hash(scope.path)); // TODO: move this logic elsewhere
    return this.createNetwork(seeders, graph, baseDir, opts);
  }
  async createNetwork(seeders: string[], graph: Graph, baseDir, opts?: {}) {
    const config = Object.assign(
      {},
      {
        installPackages: true,
        packageManager: undefined
      },
      opts
    );
    const components = findSuccessorsInGraph(graph, seeders);
    const capsules = await this.createCapsulesFromComponents(components, baseDir, config);
    const capsuleList = new CapsuleList(...capsules.map(c => ({ id: c.bitId, value: c })));
    await this.writeComponentFilesToCapsules(components, graph, this._buildCapsulePaths(capsules), capsuleList);
    if (config.installPackages && config.packageManager) {
      await this.packageManager.runInstall(capsules, { packageManager: config.packageManager });
    } else if (config.installPackages) {
      await this.packageManager.runInstall(capsules);
    }
    return {
      capsules: capsuleList,
      components: graph
    };
  }
  private async createCapsulesFromComponents(components: any[], baseDir, orchOptions): Promise<Capsule[]> {
    const capsules: Capsule[] = await Promise.all(
      map((component: Component) => {
        // @ts-ignore - fix by moving to componentId
        // return this.capsule.create(component.id, baseDir, orchOptions);
        return Capsule.createFromBitId(component.id, baseDir, orchOptions);
      }, components)
    );
    return capsules;
  }

  async list(consumer: Consumer): Promise<ListResults[] | ListResults> {
    const workspacePath = consumer.getPath();
    try {
      const workspaceCapsuleFolder = path.join(CAPSULES_BASE_DIR, hash(workspacePath));
      const capsules = await fs.readdir(workspaceCapsuleFolder);
      const capsuleFullPaths = capsules.map(c => path.join(workspaceCapsuleFolder, c));
      return {
        workspace: workspacePath,
        capsules: capsuleFullPaths
      };
    } catch (e) {
      if (e.code === 'ENOENT') {
        return { workspace: workspacePath, capsules: [] };
      }
      throw e;
    }
  }

  private _buildCapsulePaths(capsules: Capsule[]): CapsulePaths {
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

  static async provide(config: any, [packageManager]: IsolatorDeps) {
    return new Isolator(packageManager);
  }

  _manipulateDir(componentWithDependencies: ComponentWithDependencies) {
    const allComponents = [componentWithDependencies.component, ...componentWithDependencies.allDependencies];
    const manipulateDirData = getManipulateDirForComponentWithDependencies(componentWithDependencies);
    allComponents.forEach(component => {
      component.stripOriginallySharedDir(manipulateDirData);
    });
  }
}
