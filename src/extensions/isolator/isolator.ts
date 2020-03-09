import path from 'path';
import hash from 'object-hash';
import fs from 'fs-extra';
import { flatten, filter, uniq, concat, map, equals } from 'ramda';
import { CACHE_ROOT } from '../../constants';
import { Component } from '../component';
import ConsumerComponent from '../../consumer/component';
import { PackageManager } from '../package-manager';
import { Capsule } from './capsule';
import writeComponentsToCapsules from './write-components-to-capsules';
import Consumer from '../../consumer/consumer';
import { loadScope } from '../../scope';
import CapsuleList from './capsule-list';
import Graph from '../../scope/graph/graph'; // TODO: use graph extension?
import { BitId } from '../../bit-id';

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

async function createCapsulesFromComponents(components: any[], baseDir, orchOptions): Promise<Capsule[]> {
  const capsules: Capsule[] = await Promise.all(
    map((component: Component) => {
      return Capsule.createFromComponent(component, baseDir, orchOptions);
    }, components)
  );
  return capsules;
}

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
  static async provide([packageManager]: IsolatorDeps) {
    return new Isolator(packageManager);
  }

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
    const capsules = await createCapsulesFromComponents(components, baseDir, config);

    const capsuleList = new CapsuleList(
      ...capsules.map(c => {
        const id = c.component.id instanceof BitId ? c.component.id : c.component.id.legacyComponentId;
        return { id, value: c };
      })
    );
    const before = await getPackageJSONInCapsules(capsules);

    await writeComponentsToCapsules(components, graph, capsules, capsuleList);
    const after = await getPackageJSONInCapsules(capsules);

    const toInstall = capsules.filter((item, i) => !equals(before[i], after[i]));

    if (config.installPackages && config.packageManager) {
      await this.packageManager.runInstall(toInstall, { packageManager: config.packageManager });
    } else if (config.installPackages) {
      await this.packageManager.runInstall(toInstall);
    }
    return {
      capsules: capsuleList,
      components: graph
    };
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
}

async function getPackageJSONInCapsules(capsules: Capsule[]) {
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
