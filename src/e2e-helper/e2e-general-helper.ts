import * as path from 'path';
import fs from 'fs-extra';
import { expect } from 'chai';
import { BIT_VERSION } from '../constants';
import defaultErrorHandler from '../cli/default-error-handler';
import { removeChalkCharacters } from '../utils';
import { ensureAndWriteJson, generateRandomStr } from './e2e-helper';
import NpmHelper from './e2e-npm-helper';
import CommandHelper from './e2e-command-helper';
import ScopesData from './e2e-scopes';

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
  writeIndexJson(indexJson: Record<string, any>) {
    return ensureAndWriteJson(this.indexJsonPath(), indexJson);
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

  runWithTryCatch(cmd: string, cwd: string = this.scopes.localPath) {
    let output;
    try {
      output = this.command.runCmd(cmd, cwd);
    } catch (err) {
      output = err.toString() + err.stdout.toString();
    }
    return output;
  }

  static alignOutput(str?: string | null | undefined): string | null | undefined {
    if (!str) return str;
    // on Mac the directory '/var' is sometimes shown as '/private/var'
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return removeChalkCharacters(str).replace(/\/private\/var/g, '/var');
  }

  expectToThrow(cmdFunc: Function, error: Error) {
    let output;
    try {
      cmdFunc();
    } catch (err) {
      output = err.toString();
    }

    const errorString = defaultErrorHandler(error);
    expect(GeneralHelper.alignOutput(output)).to.have.string(GeneralHelper.alignOutput(errorString) as string);
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
}
