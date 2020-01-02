import path from 'path';
import R from 'ramda';
import os from 'os';
import hash from 'object-hash';
import { BitId } from '../bit-id';
import orchestrator, { CapsuleOrchestrator } from '../orchestrator/orchestrator';
import { CapsuleOptions, CreateOptions } from '../orchestrator/types';
import Consumer from '../consumer/consumer';
import BitCapsule from '../capsule/bit-capsule';
import Isolator from './isolator';
import DataToPersist from '../consumer/component/sources/data-to-persist';
import { getComponentLinks } from '../links/link-generator';
import Graph from '../scope/graph/graph';
import { Queue } from '../utils';

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
    private orch: CapsuleOrchestrator | undefined = orchestrator
  ) {}

  private _buildCapsuleMap(capsules: BitCapsule[]) {
    const capsuleMapping = {};
    // eslint-disable-next-line array-callback-return
    R.map((capsule: BitCapsule) => {
      capsuleMapping[capsule.bitId.toString()] = capsule.wrkDir;
    }, capsules);
    return capsuleMapping;
  }

  async isolateComponents(
    consumer: Consumer,
    bitIds: BitId[],
    capsuleOptions?: CapsuleOptions,
    orchestrationOptions?: Options
  ): Promise<{ [bitId: string]: BitCapsule }> {
    const actualCapsuleOptions = Object.assign({}, DEFAULT_ISOLATION_OPTIONS, capsuleOptions);
    const orchOptions = Object.assign({}, DEFAULT_OPTIONS, orchestrationOptions);
    const graph = await Graph.buildGraphFromWorkspace(consumer);
    const depenenciesFromAllIds = bitIds.map(bitId => {
      const dependencies = [];
      const visited = {};
      graph.getSuccessorsByEdgeTypeRecursively(bitId.toString(), dependencies, visited);
      return dependencies;
    });

    const bitIdsToCreate = R.uniq(
      R.concat(
        R.flatten(depenenciesFromAllIds),
        bitIds.map(bitId => bitId.toString())
      )
    );
    const bitIdFormat = R.map(bitId => consumer.getParsedId(bitId), bitIdsToCreate);

    // create capsules
    const capsules: BitCapsule[] = await Promise.all(
      R.map((component: BitId) => this.createCapsule(component, actualCapsuleOptions, orchOptions), bitIdFormat)
    );

    // generate capsule map
    const capsuleMapping = this._buildCapsuleMap(capsules);

    await this.queue.addAll(
      R.map(
        capsule => () => this._isolate(consumer, capsule, actualCapsuleOptions, orchOptions, capsuleMapping),
        capsules
      )
    );

    if (actualCapsuleOptions.installPackages) await this.installpackages(capsules, consumer.config.packageManager);
    await this.queue.onIdle();
    return capsules.reduce(function(acc, cur) {
      acc[cur.bitId.toString()] = cur;
      return acc;
    }, {});
  }

  async createCapsule(bitId: BitId, capsuleOptions?: CapsuleOptions, orchestrationOptions?: Options) {
    const actualCapsuleOptions = Object.assign({}, DEFAULT_ISOLATION_OPTIONS, capsuleOptions);
    const orchOptions = Object.assign({}, DEFAULT_OPTIONS, orchestrationOptions);
    if (!this.orch) throw new Error('cant load orch in non consumer env');
    const config = this._generateResourceConfig(bitId, actualCapsuleOptions, orchOptions);
    return this.orch.getCapsule(this.workspace, config, orchOptions);
  }

  async writeLinkFiles(consumer: Consumer, isolator: Isolator): Promise<void> {
    isolator.componentWithDependencies.component.writtenPath = '.';
    const componentLinkFiles: DataToPersist = getComponentLinks({
      consumer,
      component: isolator.componentWithDependencies.component,
      dependencies: isolator.componentWithDependencies.allDependencies,
      bitMap: consumer.bitMap,
      createNpmLinkFiles: false
    });

    await Promise.all(componentLinkFiles.files.map(file => isolator.capsule.outputFile(file.path, file.contents, {})));
  }

  async installpackages(capsules: BitCapsule[], packageManager = 'yarn'): Promise<void> {
    const command = packageManager === 'yarn' ? 'yarn' : 'npm install';
    const executions = capsules.map(capsule => () => capsule.exec({ command: command.split(' ') }));
    await this.queue.addAll(executions);
  }

  private async _isolate(
    consumer: Consumer,
    capsule: BitCapsule,
    capsuleOptions: CapsuleOptions,
    options: Options,
    capsuleMap: { [bitId: string]: string }
  ) {
    const isolator: Isolator = await Isolator.getInstance(
      'fs',
      consumer.scope,
      consumer,
      capsule.wrkDir,
      capsule,
      capsuleMap
    );
    await isolator.isolate(
      capsule.bitId,
      Object.assign(
        {},
        DEFAULT_ISOLATION_OPTIONS,
        {
          writeToPath: capsule.wrkDir,
          keepExistingCapsule: !options.alwaysNew
        },
        capsuleOptions
      )
    );
    return this.writeLinkFiles(consumer, isolator);
  }

  private _generateWrkDir(bitId: string, capsuleOptions: CapsuleOptions, options: Options) {
    const baseDir = capsuleOptions.baseDir || os.tmpdir();
    capsuleOptions.baseDir = baseDir;
    if (options.alwaysNew) return path.join(baseDir, `${bitId}_${options.name}`);
    if (options.name) return path.join(baseDir, `${bitId}_${options.name}`);
    return path.join(baseDir, `${bitId}_${hash(capsuleOptions)}`);
  }

  private _generateResourceConfig(bitId: BitId, capsuleOptions: CapsuleOptions, options: Options): CreateOptions {
    const wrkDir = this._generateWrkDir(bitId.toString(), capsuleOptions, options);
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
