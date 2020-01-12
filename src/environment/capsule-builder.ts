import execa from 'execa';
import path from 'path';
import R from 'ramda';
import os from 'os';
import v4 from 'uuid';
import pLimit, { Limit } from 'p-limit';
import hash from 'object-hash';
import { BitId, BitIds } from '../bit-id';
import orchestrator, { CapsuleOrchestrator } from '../orchestrator/orchestrator';
import { CapsuleOptions, CreateOptions } from '../orchestrator/types';
import Consumer from '../consumer/consumer';
import BitCapsule from '../capsule-ext/bit-capsule';
import Isolator from './isolator';
import DataToPersist from '../consumer/component/sources/data-to-persist';
import { getComponentLinks } from '../links/link-generator';
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
    private limit: Limit = pLimit(10),
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
    workspace: Workspace,
    bitIds: BitId[],
    capsuleOptions?: CapsuleOptions,
    orchestrationOptions?: Options
  ): Promise<{ [bitId: string]: BitCapsule }> {
    const actualCapsuleOptions = Object.assign({}, DEFAULT_ISOLATION_OPTIONS, capsuleOptions);
    const orchOptions = Object.assign({}, DEFAULT_OPTIONS, orchestrationOptions);
    const components = await workspace.loadComponentsForCapsule(bitIds);

    const capsules: BitCapsule[] = await Promise.all(
      R.map((component: Component) => this.createCapsule(component.id, actualCapsuleOptions, orchOptions), components)
    );
    const capsuleMapping = this._buildCapsuleMap(capsules);
    await Promise.all(
      R.map(
        capsule => this._isolate(workspace._consumer, capsule, actualCapsuleOptions, orchOptions, capsuleMapping),
        capsules
      )
    );
    if (actualCapsuleOptions.installPackages) await this.installpackages(capsules);
    const res = capsules.reduce(function(acc, cur) {
      acc[cur.bitId.toString()] = cur;
      return acc;
    }, {});
    return res;
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
          writeDists: true,
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
    if (options.alwaysNew) return path.join(baseDir, `${bitId}_${v4()}`);
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
