import path from 'path';
import { flatten, filter, uniq, concat, map, equals } from 'ramda';
import os from 'os';
import hash from 'object-hash';
import v4 from 'uuid';
import filenamify from 'filenamify';
import { BitId } from '../../bit-id';
import orchestrator, { CapsuleOrchestrator } from '../capsule/orchestrator/orchestrator';
import { PackageManager } from '../package-manager';
import { CapsuleOptions, CreateOptions } from '../capsule/orchestrator/types';
import Consumer from '../../consumer/consumer';
import { ComponentCapsule } from '../capsule-ext';
import { getComponentLinks } from '../../links/link-generator';
import { Queue } from '../../utils';
import ManyComponentsWriter, { ManyComponentsWriterParams } from '../../consumer/component-ops/many-components-writer';
import { ComponentWithDependencies, loadScope } from '../../scope';
import { getManipulateDirForComponentWithDependencies } from '../../consumer/component-ops/manipulate-dir';
import Graph from '../../scope/graph/graph';
import Component from '../../consumer/component';
import { loadConsumerIfExist } from '../../consumer';
import CapsulePaths from './capsule-paths';
import CapsuleList from './capsule-list';

export type Options = {
  alwaysNew: boolean;
  name?: string;
};

const DEFAULT_ISOLATION_OPTIONS: CapsuleOptions = {
  baseDir: os.tmpdir(),
  writeDists: true,
  writeBitDependencies: true,
  installPackages: true,
  workspace: 'string'
};

const DEFAULT_OPTIONS = {
  alwaysNew: false
};

export default class CapsuleBuilder {
  constructor(
    private workspace: string,
    private packageManagerInstance: PackageManager,
    private queue: Queue = new Queue(),
    private orch: CapsuleOrchestrator = orchestrator
  ) {}

  private _buildCapsulePaths(capsules: ComponentCapsule[]): CapsulePaths {
    const capsulePaths = capsules.map(componentCapsule => ({
      id: componentCapsule.bitId,
      value: componentCapsule.wrkDir
    }));
    return new CapsulePaths(...capsulePaths);
  }

  async isolateComponents(
    bitIds: string[],
    capsuleOptions?: CapsuleOptions,
    orchestrationOptions?: Options,
    consumer?: Consumer
  ): Promise<CapsuleList> {
    const actualCapsuleOptions = Object.assign({}, DEFAULT_ISOLATION_OPTIONS, capsuleOptions);
    const orchOptions = Object.assign({}, DEFAULT_OPTIONS, orchestrationOptions);
    const scope = await loadScope(process.cwd());
    const loadedConsumer = consumer || (await loadConsumerIfExist());
    const graph = loadedConsumer
      ? await Graph.buildGraphFromWorkspace(loadedConsumer)
      : await Graph.buildGraphFromScope(scope);
    const depenenciesFromAllIds = flatten(bitIds.map(bitId => graph.getSuccessorsByEdgeTypeRecursively(bitId)));
    const components: Component[] = filter(
      val => val,
      uniq(concat(depenenciesFromAllIds, bitIds)).map((id: string) => graph.node(id))
    );

    // create capsules
    const capsules: ComponentCapsule[] = await Promise.all(
      map((component: Component) => this.createCapsule(component.id, actualCapsuleOptions, orchOptions), components)
    );

    const capsuleList = new CapsuleList(...capsules.map(c => ({ id: c.bitId, value: c })));

    const before = await getPackageJSONInCapsules(capsules);

    await this.isolateComponentsInCapsules(components, graph, this._buildCapsulePaths(capsules), capsuleList);

    const after = await getPackageJSONInCapsules(capsules);

    const toInstall = capsules.filter((item, i) => !equals(before[i], after[i]));

    if (actualCapsuleOptions.installPackages) {
      if (actualCapsuleOptions.packageManager) {
        await this.packageManagerInstance.runInstall(toInstall, {
          packageManager: actualCapsuleOptions.packageManager
        });
      } else {
        await this.packageManagerInstance.runInstall(toInstall);
      }
    }
    return capsuleList;
  }

  async createCapsule(
    bitId: BitId,
    capsuleOptions?: CapsuleOptions,
    orchestrationOptions?: Options
  ): Promise<ComponentCapsule> {
    const actualCapsuleOptions = Object.assign({}, DEFAULT_ISOLATION_OPTIONS, capsuleOptions);
    const orchOptions = Object.assign({}, DEFAULT_OPTIONS, orchestrationOptions);
    const config = this._generateResourceConfig(bitId, actualCapsuleOptions, orchOptions);
    return this.orch.getCapsule(capsuleOptions?.workspace || this.workspace, config, orchOptions);
  }

  _manipulateDir(componentWithDependencies: ComponentWithDependencies) {
    const allComponents = [componentWithDependencies.component, ...componentWithDependencies.allDependencies];
    const manipulateDirData = getManipulateDirForComponentWithDependencies(componentWithDependencies);
    allComponents.forEach(component => {
      component.stripOriginallySharedDir(manipulateDirData);
    });
  }

  async isolateComponentsInCapsules(
    components: Component[],
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

  private _generateWrkDir(bitId: string, capsuleOptions: CapsuleOptions, options: Options) {
    const baseDir = capsuleOptions.baseDir || os.tmpdir();
    capsuleOptions.baseDir = baseDir;
    if (options.alwaysNew) return path.join(baseDir, `${bitId}_${v4()}`);
    if (options.name) return path.join(baseDir, `${bitId}_${options.name}`);
    return path.join(baseDir, `${bitId}_${hash(capsuleOptions)}`);
  }

  private _generateResourceConfig(bitId: BitId, capsuleOptions: CapsuleOptions, options: Options): CreateOptions {
    const dirName = filenamify(bitId.toString(), { replacement: '_' });
    const wrkDir = this._generateWrkDir(dirName, capsuleOptions, options);
    const ret = {
      resourceId: `${bitId.toString()}_${hash(wrkDir)}`,
      options: Object.assign(
        {},
        {
          bitId,
          wrkDir
        },
        capsuleOptions
      )
    };
    return ret;
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
