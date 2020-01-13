import path from 'path';
import execa from 'execa';
import R from 'ramda';
import os from 'os';
import hash from 'object-hash';
import v4 from 'uuid';
import filenamify from 'filenamify';
import { BitId, BitIds } from '../bit-id';
import orchestrator, { CapsuleOrchestrator } from '../orchestrator/orchestrator';
import { CapsuleOptions, CreateOptions } from '../orchestrator/types';
import Consumer from '../consumer/consumer';
import BitCapsule from '../capsule-ext/bit-capsule';
import { getComponentLinks } from '../links/link-generator';
import { Queue } from '../utils';
import ManyComponentsWriter, { ManyComponentsWriterParams } from '../consumer/component-ops/many-components-writer';
import { ComponentWithDependencies, loadScope } from '../scope';
import { getManipulateDirForComponentWithDependencies } from '../consumer/component-ops/manipulate-dir';
import Graph from '../scope/graph/graph';
import Component from '../consumer/component';
import { Workspace } from '../workspace';

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

  private _buildCapsuleMap(capsules: BitCapsule[]) {
    return capsules.reduce(function(acc, cur) {
      acc[cur.bitId.toString()] = cur.wrkDir;
      return acc;
    }, {});
  }

  async isolateComponents(
    bitIds: string[],
    capsuleOptions?: CapsuleOptions,
    orchestrationOptions?: Options,
    consumer?: Consumer
  ): Promise<{ [bitId: string]: BitCapsule }> {
    const actualCapsuleOptions = Object.assign({}, DEFAULT_ISOLATION_OPTIONS, capsuleOptions);
    const orchOptions = Object.assign({}, DEFAULT_OPTIONS, orchestrationOptions);
    const scope = await loadScope(process.cwd());
    const graph = consumer ? await Graph.buildGraphFromWorkspace(consumer) : await Graph.buildGraphFromScope(scope);
    const depenenciesFromAllIds = R.flatten(bitIds.map(bitId => graph.getSuccessorsByEdgeTypeRecursively(bitId)));

    const components: Component[] = R.uniq(R.concat(depenenciesFromAllIds, bitIds)).map((id: string) => graph.node(id));

    // create capsules
    const capsules: BitCapsule[] = await Promise.all(
      R.map((component: Component) => this.createCapsule(component.id, actualCapsuleOptions, orchOptions), components)
    );

    const bitCapsulesObject: { [componentId: string]: BitCapsule } = capsules.reduce(function(acc, cur) {
      acc[cur.bitId.toString()] = cur;
      return acc;
    }, {});

    await this.isolateComponentsInCapsules(components, graph, this._buildCapsuleMap(capsules), bitCapsulesObject);
    return bitCapsulesObject;
  }

  async createCapsule(bitId: BitId, capsuleOptions?: CapsuleOptions, orchestrationOptions?: Options) {
    const actualCapsuleOptions = Object.assign({}, DEFAULT_ISOLATION_OPTIONS, capsuleOptions);
    const orchOptions = Object.assign({}, DEFAULT_OPTIONS, orchestrationOptions);
    const config = this._generateResourceConfig(bitId, actualCapsuleOptions, orchOptions);
    return this.orch.getCapsule(this.workspace, config, orchOptions);
  }

  async installpackages(capsules: BitCapsule[]): Promise<void> {
    try {
      capsules.map(capsule => {
        const packageJsonPath = path.join(capsule.wrkDir, 'package.json');
        const pjsonString = capsule.fs.readFileSync(packageJsonPath).toString();
        const packageJson = JSON.parse(pjsonString);
        const bitBinPath = './node_modules/bit-bin';
        const localBitBinPath = path.join(__dirname, '../..');
        delete packageJson.dependencies['bit-bin'];
        capsule.fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
        execa.sync('yarn', [], { cwd: capsule.wrkDir });
        capsule.fs.unlinkSync(path.join(capsule.wrkDir, bitBinPath));
        execa.sync('ln', ['-s', localBitBinPath, bitBinPath], { cwd: capsule.wrkDir });
      });
      return Promise.resolve();
      // await Promise.all(capsules.map(capsule => this.limit(() => capsule.exec({ command: `yarn`.split(' ') }))));
    } catch (e) {
      console.log(e);
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
    capsuleMappingForPackageJson: { [componentId: string]: string },
    capsuleObject: { [componentId: string]: BitCapsule }
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
      capsuleWrkspaceMap: capsuleMappingForPackageJson
    };
    componentsWithDependencies.map(cmp => this._manipulateDir(cmp));
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
