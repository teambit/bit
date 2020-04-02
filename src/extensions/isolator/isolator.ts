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
import { buildOneGraphForComponents } from '../../scope/graph/components-graph';

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
    const seedersIds = seeders.map(seeder => consumer.getParsedId(seeder));
    const graph = await buildOneGraphForComponents(seedersIds, consumer);
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
    const packageManager = this.packageManager;
    const before = await getPackageJSONInCapsules(capsules, packageManager);

    await writeComponentsToCapsules(components, graph, capsules, capsuleList, this.packageManager.name);
    const after = await getPackageJSONInCapsules(capsules, packageManager);
    const toInstall = capsules.filter((item, i) => {
      console.log(after[i].packageManager);
      return (
        !equals(before[i], after[i]) ||
        after[i].packageManager === '' ||
        !isOldPackageManager(after[i].packageManager, config, packageManager)
      );
    });
    //   await Promise.all(
    //   capsules
    //     .filter((_, i) => !isOldPackageManager(config, after, i, packageManager))
    //     .map(capsule => packageManager.removeLockFilesInCapsule(capsule))
    // );
    //  const toInstall = capsules;
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

function isOldPackageManager(
  name: string,
  config: { installPackages: boolean; packageManager: undefined },
  packageManager: PackageManager
) {
  const res = config.packageManager ? name === config.packageManager : name === packageManager.packageManagerName;
  return res;
}

async function getPackageJSONInCapsules(capsules: Capsule[], pm: PackageManager) {
  const resolvedJsons = await Promise.all(
    capsules.map(async capsule => {
      const packageJsonPath = path.join(capsule.wrkDir, 'package.json');
      let capsuleJson: any = null;
      let packageManager = '';

      try {
        capsuleJson = await capsule.fs.promises.readFile(packageJsonPath, { encoding: 'utf8' });
        packageManager = await pm.checkPackageManagerInCapsule(capsule);
        return { capsuleJson: JSON.parse(capsuleJson), packageManager };
        // eslint-disable-next-line no-empty
      } catch (e) {}
      return { capsuleJson, packageManager };
    })
  );
  return resolvedJsons;
}
