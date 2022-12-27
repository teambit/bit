import { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';
import { compact } from 'lodash';
import tar from 'tar';
import { DEFAULT_LANE } from '@teambit/lane-id';
import defaultErrorHandler from '../cli/default-error-handler';
import { BIT_HIDDEN_DIR, BIT_VERSION, MergeConfigFilename, REMOTE_REFS_DIR, WORKSPACE_JSONC } from '../constants';
import { generateRandomStr, removeChalkCharacters } from '../utils';
import CommandHelper from './e2e-command-helper';
import { ensureAndWriteJson } from './e2e-helper';
import NpmHelper from './e2e-npm-helper';
import ScopesData, { DEFAULT_OWNER } from './e2e-scopes';

export default class GeneralHelper {
  scopes: ScopesData;
  npm: NpmHelper;
  command: CommandHelper;
  constructor(scopes: ScopesData, npmHelper: NpmHelper, commandHelper: CommandHelper) {
    this.scopes = scopes;
    this.npm = npmHelper;
    this.command = commandHelper;
  }
  indexJsonPath() {
    return path.join(this.scopes.localPath, '.bit/index.json');
  }
  getIndexJson() {
    return fs.readJsonSync(this.indexJsonPath());
  }
  getComponentsFromIndexJson(): any[] {
    const indexJson = this.getIndexJson();
    return indexJson.components;
  }
  writeIndexJson(components: any[] = [], lanes: any[] = []) {
    return ensureAndWriteJson(this.indexJsonPath(), { components, lanes });
  }
  getRemoteRefPath(lane = DEFAULT_LANE, remote = this.scopes.remote) {
    return path.join(this.scopes.localPath, BIT_HIDDEN_DIR, REMOTE_REFS_DIR, remote, lane);
  }
  getRemoteRefContent(lane = DEFAULT_LANE, remote = this.scopes.remote) {
    const refPath = this.getRemoteRefPath(lane, remote);
    return fs.readJsonSync(refPath);
  }
  getRemoteHead(compId: string, lane = DEFAULT_LANE, remote = this.scopes.remote): string {
    const refContent = this.getRemoteRefContent(lane, remote);
    const record = refContent.find((_) => _.id.name === compId);
    if (!record) throw new Error(`unable to find ${compId} in the ref file`);
    return record.head;
  }
  getHashPathOfComponent(compId: string, cwd = this.scopes.localPath): string {
    const scope = this.command.catScope(true, cwd);
    const comp3 = scope.find((item) => item.name === compId);
    if (!comp3) throw new Error(`getHashPathOfComponent unable to find ${compId} in the scope`);
    const hash = comp3.hash;
    return this.getHashPathOfObject(hash);
  }
  getHashPathOfObject(hash: string, relativeToWorkspace = false) {
    const objectPath = path.join(hash.slice(0, 2), hash.slice(2));
    return relativeToWorkspace ? path.join('.bit/objects', objectPath) : objectPath;
  }
  installAndGetTypeScriptCompilerDir(): string {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.npm.installNpmPackage('typescript');
    return path.join(this.scopes.localPath, 'node_modules', '.bin');
  }
  setProjectAsAngular() {
    this.npm.initNpm();
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.npm.installNpmPackage('@angular/core');
  }
  nodeStart(mainFilePath: string, cwd?: string) {
    return this.command.runCmd(`node ${mainFilePath}`, cwd);
  }

  untarFile(filePath: string, dir: string, sync: boolean) {
    return tar.x({ file: filePath, C: dir, sync });
  }

  runWithTryCatch(cmd: string, cwd: string = this.scopes.localPath, overrideFeatures?: string): string {
    let output: string;
    try {
      output = this.command.runCmd(cmd, cwd, undefined, overrideFeatures);
    } catch (err: any) {
      output = err.toString() + err.stdout.toString();
    }
    return output;
  }

  static alignOutput(str?: string | undefined): string | undefined {
    if (!str) return str;
    // on Mac the directory '/var' is sometimes shown as '/private/var'
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return removeChalkCharacters(str).replace(/\/private\/var/g, '/var');
  }

  expectToThrow(cmdFunc: Function, error: Error) {
    let output;
    try {
      cmdFunc();
    } catch (err: any) {
      output = err.toString();
    }

    const { message: errorString } = defaultErrorHandler(error);
    expect(GeneralHelper.alignOutput(output)).to.have.string(GeneralHelper.alignOutput(errorString) as string);
  }

  isHarmonyProject() {
    return fs.existsSync(path.join(this.scopes.localPath, WORKSPACE_JSONC));
  }

  getRequireBitPath(box: string, name: string) {
    return `@bit/${this.scopes.remote}.${box}.${name}`;
  }

  getBitVersion() {
    return BIT_VERSION;
  }

  generateRandomTmpDirName() {
    return path.join(this.scopes.e2eDir, generateRandomStr());
  }

  getExtension(component, extName: string) {
    return component.extensions.find((e) => e.name === extName);
  }

  getStagedConfig(laneName = 'main') {
    return fs.readJSONSync(path.join(this.scopes.localPath, '.bit', 'staged-config', `${laneName}.json`));
  }

  getPackageNameByCompName(compName: string) {
    return `@${DEFAULT_OWNER}/${this.scopes.remoteWithoutOwner}.${compName.replaceAll('/', '.')}`;
  }

  getConfigMergePath(compId: string, remoteWithOwner = true) {
    const remote = remoteWithOwner ? this.scopes.remote : this.scopes.remoteWithoutOwner;
    return path.join(this.scopes.localPath, remote, compId, MergeConfigFilename);
  }

  fixMergeConfigConflict(strategy: string, compId: string, remoteWithOwner = true) {
    const filePath = this.getConfigMergePath(compId, remoteWithOwner);
    const fileContent = fs.readFileSync(filePath).toString();
    const toRemove = strategy === 'ours' ? '>>>>>>>' : '<<<<<<<';
    const toKeep = strategy === 'ours' ? '<<<<<<<' : '>>>>>>>';
    let shouldBeRemoving = false;
    let shouldKeep = false;
    const lines = fileContent.split('\n').map((line) => {
      if (line.startsWith(toRemove)) {
        if (shouldBeRemoving) {
          shouldBeRemoving = false;
        } else {
          shouldBeRemoving = true;
        }
        return '';
      }
      if (line.startsWith('=======')) {
        if (shouldKeep) {
          shouldKeep = false;
          shouldBeRemoving = true;
        } else {
          shouldKeep = true;
          shouldBeRemoving = false;
        }
        return '';
      }
      if (line.startsWith(toKeep)) {
        if (shouldKeep) {
          shouldKeep = false;
        } else {
          shouldKeep = true;
        }
        return '';
      }
      return shouldBeRemoving ? '' : line;
    });
    fs.writeFileSync(filePath, compact(lines).join('\n'));
  }
}
