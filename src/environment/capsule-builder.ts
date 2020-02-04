import path from 'path';
import execa from 'execa';
import R from 'ramda';
import os from 'os';
import hash from 'object-hash';
import v4 from 'uuid';
import filenamify from 'filenamify';
import { BitId } from '../bit-id';
import orchestrator, { CapsuleOrchestrator } from '../extensions/capsule/orchestrator/orchestrator';
import { CapsuleOptions, CreateOptions } from '../extensions/capsule/orchestrator/types';
import Consumer from '../consumer/consumer';
import { ComponentCapsule } from '../extensions/capsule-ext';
import { getComponentLinks } from '../links/link-generator';
import { Queue } from '../utils';
import ManyComponentsWriter, { ManyComponentsWriterParams } from '../consumer/component-ops/many-components-writer';
import { ComponentWithDependencies, loadScope } from '../scope';
import { getManipulateDirForComponentWithDependencies } from '../consumer/component-ops/manipulate-dir';
import Graph from '../scope/graph/graph';
import Component from '../consumer/component';
import { loadConsumerIfExist } from '../consumer';
import CapsulePaths from './capsule-paths';

export type Options = {
  alwaysNew: boolean;
  name?: string;
};

const DEFAULT_ISOLATION_OPTIONS = {
  baseDir: os.tmpdir(),
  writeDists: true,
  writeBitDependencies: true,
  installPackages: true
};

const DEFAULT_OPTIONS = {
  alwaysNew: false
};

export default class CapsuleBuilder {
  constructor(
    private workspace: string,
    private queue: Queue = new Queue(),
    private orch: CapsuleOrchestrator = orchestrator
  ) {}

  private _buildCapsulePaths(capsules: ComponentCapsule[]): CapsulePaths {
    const capsulePaths = capsules.map(componentCapsule => ({
      id: componentCapsule.bitId,
      path: componentCapsule.wrkDir
    }));
    return new CapsulePaths(...capsulePaths);
  }

  async isolateComponents(
    bitIds: string[],
    capsuleOptions?: CapsuleOptions,
    orchestrationOptions?: Options,
    consumer?: Consumer
  ): Promise<{ [componentId: string]: ComponentCapsule }> {
    const actualCapsuleOptions = Object.assign({}, DEFAULT_ISOLATION_OPTIONS, capsuleOptions);
    const orchOptions = Object.assign({}, DEFAULT_OPTIONS, orchestrationOptions);
    const scope = await loadScope(process.cwd());
    const loadedConsumer = consumer || (await loadConsumerIfExist());
    const graph = loadedConsumer
      ? await Graph.buildGraphFromWorkspace(loadedConsumer)
      : await Graph.buildGraphFromScope(scope);
    const depenenciesFromAllIds = R.flatten(bitIds.map(bitId => graph.getSuccessorsByEdgeTypeRecursively(bitId)));

    const components: Component[] = R.filter(
      val => val,
      R.uniq(R.concat(depenenciesFromAllIds, bitIds)).map((id: string) => graph.node(id))
    );

    // create capsules
    const capsules: ComponentCapsule[] = await Promise.all(
      R.map((component: Component) => this.createCapsule(component.id, actualCapsuleOptions, orchOptions), components)
    );

    const bitCapsulesObject: { [componentId: string]: ComponentCapsule } = capsules.reduce(function(acc, cur) {
      acc[cur.bitId.toString()] = cur;
      return acc;
    }, {});

    await this.isolateComponentsInCapsules(components, graph, this._buildCapsulePaths(capsules), bitCapsulesObject);
    if (actualCapsuleOptions.installPackages) await this.installpackages(capsules);
    return bitCapsulesObject;
  }

  async createCapsule(bitId: BitId, capsuleOptions?: CapsuleOptions, orchestrationOptions?: Options) {
    const actualCapsuleOptions = Object.assign({}, DEFAULT_ISOLATION_OPTIONS, capsuleOptions);
    const orchOptions = Object.assign({}, DEFAULT_OPTIONS, orchestrationOptions);
    const config = this._generateResourceConfig(bitId, actualCapsuleOptions, orchOptions);
    return this.orch.getCapsule(this.workspace, config, orchOptions);
  }

  async installpackages(capsules: ComponentCapsule[]): Promise<void> {
    try {
      capsules.forEach(capsule => {
        const packageJsonPath = path.join(capsule.wrkDir, 'package.json');
        const pjsonString = capsule.fs.readFileSync(packageJsonPath).toString();
        const packageJson = JSON.parse(pjsonString);
        const bitBinPath = './node_modules/bit-bin';
        const localBitBinPath = path.join(__dirname, '../..');
        delete packageJson.dependencies['bit-bin'];
        capsule.fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
        execa.sync('yarn', [], { cwd: capsule.wrkDir });
        if (capsule.fs.existsSync(path.join(capsule.wrkDir, bitBinPath))) {
          capsule.fs.unlinkSync(path.join(capsule.wrkDir, bitBinPath));
        }

        execa.sync('ln', ['-s', localBitBinPath, bitBinPath], { cwd: capsule.wrkDir });
      });
      return Promise.resolve();
      // await Promise.all(capsules.map(capsule => this.limit(() => capsule.exec({ command: `yarn`.split(' ') }))));
    } catch (e) {
      // TODO: think if we really need to log it here or write it to logger or throw it
      console.log(e); // eslint-disable-line no-console
      return Promise.resolve();
    }
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
    capsuleObject: { [componentId: string]: ComponentCapsule }
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
      writeDists: true,
      installNpmPackages: false,
      installPeerDependencies: false,
      addToRootPackageJson: false,
      verbose: false,
      excludeRegistryPrefix: false,
      silentPackageManagerResult: false,
      isolated: true,
      capsulePaths
    };
    // componentsWithDependencies.map(cmp => this._manipulateDir(cmp));
    const manyComponentsWriter = new ManyComponentsWriter(concreteOpts);
    await manyComponentsWriter._populateComponentsFilesToWriteCapsule();
    componentsWithDependencies.forEach(componentWithDependencies => {
      const links = getComponentLinks({
        component: componentWithDependencies.component,
        dependencies: componentWithDependencies.allDependencies,
        createNpmLinkFiles: false,
        bitMap: manyComponentsWriter.bitMap
      });
      componentWithDependencies.component.dataToPersist.files = R.concat(
        links.files,
        componentWithDependencies.component.dataToPersist.files
      );
    });
    // write data to capsule
    await Promise.all(
      manyComponentsWriter.writtenComponents.map(async c => {
        const capsule = capsuleObject[c.id.toString()];
        if (!capsule) return;
        await c.dataToPersist.persistAllToCapsule(capsule, { keepExistingCapsule: false });
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
    return {
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
  }
}
