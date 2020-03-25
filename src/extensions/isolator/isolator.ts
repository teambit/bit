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
import CapsuleList from './capsule-list';
import Graph from '../../scope/graph/graph'; // TODO: use graph extension?
import { BitId } from '../../bit-id';
import { buildOneGraphForComponents, buildOneGraphForComponentsUsingScope } from '../../scope/graph/components-graph';

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
  async createNetworkFromScope(seeders: string[], scope, opts?: {}): Promise<Network> {
    // this will create a graph from only the specific components
    const seedersIds = await Promise.all(seeders.map(seeder => scope.getParsedId(seeder)));
    const graph = await buildOneGraphForComponentsUsingScope(seedersIds, scope);
    const baseDir = path.join(CAPSULES_BASE_DIR, hash(scope.path)); // TODO: move this logic elsewhere
    return this.createNetwork(seeders, graph, baseDir, opts);
  }
  async createNetwork(seeders: string[], graph: Graph, baseDir, opts?: {}) {
    // TODO: properly separate opts into opts intended for writeComponentsToCapsules
    // and opts intended for createCapsulesFromComponents
    const config = Object.assign(
      {},
      {
        installPackages: true,
        packageManager: undefined
      },
      opts
    );
    const components = graph.nodes().map(n => graph.node(n));
    const capsules = await createCapsulesFromComponents(components, baseDir, config);

    const capsuleList = new CapsuleList(
      ...capsules.map(c => {
        const id = c.component.id instanceof BitId ? c.component.id : c.component.id.legacyComponentId;
        return { id, value: c };
      })
    );
    // const before = await getPackageJSONInCapsules(capsules);

    await writeComponentsToCapsules(components, graph, capsules, capsuleList, this.packageManager.name, opts);
    // const after = await getPackageJSONInCapsules(capsules);

    // const toInstall = capsules.filter((_item, i) => !equals(before[i], after[i]));

    const toInstall = capsules;
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
