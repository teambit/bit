import path from 'path';
import hash from 'object-hash';
import fs from 'fs-extra';
import { flatten, filter, uniq, concat, map, equals } from 'ramda';
import { CACHE_ROOT, PACKAGE_JSON } from '../../constants';
import { Component } from '../component';
import ConsumerComponent from '../../consumer/component';
import { PackageManager } from '../package-manager';
import { Capsule } from './capsule';
import writeComponentsToCapsules from './write-components-to-capsules';
import Consumer from '../../consumer/consumer';
import { loadScope } from '../../scope';
import CapsuleList from './capsule-list';
import Graph from '../../scope/graph/graph'; // TODO: use graph extension?
import { BitId, BitIds } from '../../bit-id';
import { buildOneGraphForComponents } from '../../scope/graph/components-graph';
import PackageJsonFile from '../../consumer/component/package-json-file';
import componentIdToPackageName from '../../utils/bit/component-id-to-package-name';
import { symlinkDependenciesToCapsules } from './symlink-dependencies-to-capsules';
import logger from '../../logger/logger';
import { DEPENDENCIES_FIELDS } from '../../constants';

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
    logger.debug(`isolatorExt, createNetworkFromConsumer ${seeders.join(', ')}`);
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
    const capsulesWithPackagesData = await getCapsulesPackageJsonData(capsules);

    await writeComponentsToCapsules(components, graph, capsules, capsuleList, this.packageManager.name);
    if (config.installPackages) {
      const capsulesToInstall: Capsule[] = capsulesWithPackagesData
        .filter(capsuleWithPackageData => {
          const packageJsonHasChanged = wereDependenciesInPackageJsonChanged(capsuleWithPackageData);
          // @todo: when a component is tagged, it changes all package-json of its dependents, but it
          // should not trigger any "npm install" because they dependencies are symlinked by us
          return packageJsonHasChanged;
        })
        .map(capsuleWithPackageData => capsuleWithPackageData.capsule);
      await this.packageManager.runInstall(capsulesToInstall, { packageManager: config.packageManager });
      await symlinkDependenciesToCapsules(capsulesToInstall, capsuleList);
    }
    // rewrite the package-json with the component dependencies in it. the original package.json
    // that was written before, didn't have these dependencies in order for the package-manager to
    // be able to install them without crushing when the versions don't exist yet
    capsulesWithPackagesData.forEach(capsuleWithPackageData => {
      capsuleWithPackageData.capsule.fs.writeFileSync(
        PACKAGE_JSON,
        JSON.stringify(capsuleWithPackageData.currentPackageJson, null, 2)
      );
    });

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

type CapsulePackageJsonData = {
  capsule: Capsule;
  currentPackageJson: Record<string, any>;
  previousPackageJson: Record<string, any> | null;
};

function wereDependenciesInPackageJsonChanged(capsuleWithPackageData: CapsulePackageJsonData): boolean {
  const { previousPackageJson, currentPackageJson } = capsuleWithPackageData;
  if (!previousPackageJson) return true;
  return DEPENDENCIES_FIELDS.some(field => !equals(previousPackageJson[field], currentPackageJson[field]));
}

async function getCapsulesPackageJsonData(capsules: Capsule[]): Promise<CapsulePackageJsonData[]> {
  return Promise.all(
    capsules.map(async capsule => {
      const packageJsonPath = path.join(capsule.wrkDir, 'package.json');
      let previousPackageJson: any = null;
      // @ts-ignore this capsule.component thing MUST BE FIXED, once done, if it doesn't have the ConsumerComponent, use the "component" var above
      const currentPackageJson = getCurrentPackageJson(capsule.component as ConsumerComponent);
      const result: CapsulePackageJsonData = {
        capsule,
        currentPackageJson: currentPackageJson.packageJsonObject,
        previousPackageJson: null
      };
      try {
        previousPackageJson = await capsule.fs.promises.readFile(packageJsonPath, { encoding: 'utf8' });
        result.previousPackageJson = JSON.parse(previousPackageJson);
      } catch (e) {
        // package-json doesn't exist in the capsule, that's fine, it'll be considered as a cache miss
      }
      return result;
    })
  );
}

function getCurrentPackageJson(component: ConsumerComponent): PackageJsonFile {
  const newVersion = '0.0.1-new';
  const getBitDependencies = (dependencies: BitIds) => {
    return dependencies.reduce((acc, depId: BitId) => {
      const packageDependency = depId.hasVersion() ? depId.version : newVersion;
      const packageName = componentIdToPackageName(depId, component.bindingPrefix, component.defaultScope);
      acc[packageName] = packageDependency;
      return acc;
    }, {});
  };
  const bitDependencies = getBitDependencies(component.dependencies.getAllIds());
  const bitDevDependencies = getBitDependencies(component.devDependencies.getAllIds());
  const bitExtensionDependencies = getBitDependencies(component.extensions.extensionsBitIds);
  const packageJson = PackageJsonFile.createFromComponent('.', component, false);
  const addDependencies = (packageJsonFile: PackageJsonFile) => {
    packageJsonFile.addDependencies(bitDependencies);
    packageJsonFile.addDevDependencies({
      ...bitDevDependencies,
      ...bitExtensionDependencies
    });
  };
  addDependencies(packageJson);
  packageJson.addOrUpdateProperty('version', component.id.hasVersion() ? component.id.version : newVersion);
  packageJson.removeDependency('bit-bin');
  return packageJson;
}
