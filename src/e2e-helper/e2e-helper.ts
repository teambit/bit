import R from 'ramda';
import fs from 'fs-extra';
import { VERSION_DELIMITER } from '../constants';
import { removeChalkCharacters } from '../utils';
import { FileStatus } from '../consumer/versions-ops/merge-version';

import ScopesData from './e2e-scopes';
import BitJsonHelper from './e2e-bit-json-helper';
import FsHelper from './e2e-fs-helper';
import CommandHelper from './e2e-command-helper';
import ConfigHelper from './e2e-config-helper';
import BitMapHelper from './e2e-bitmap-helper';
import EnvHelper from './e2e-env-helper';
import ExtensionsHelper from './e2e-extensions-helper';
import FixtureHelper from './e2e-fixtures-helper';
import GeneralHelper from './e2e-general-helper';
import NpmHelper from './e2e-npm-helper';
import PackageJsonHelper from './e2e-package-json-helper';
import ScopeHelper from './e2e-scope-helper';
import GitHelper from './e2e-git-helper';
import BitJsoncHelper from './e2e-bit-jsonc-helper';

export default class Helper {
  debugMode: boolean;
  scopes: ScopesData;
  bitJson: BitJsonHelper;
  bitJsonc: BitJsoncHelper;
  fs: FsHelper;
  command: CommandHelper;
  config: ConfigHelper;
  bitMap: BitMapHelper;
  env: EnvHelper;
  extensions: ExtensionsHelper;
  fixtures: FixtureHelper;
  general: GeneralHelper;
  npm: NpmHelper;
  packageJson: PackageJsonHelper;
  scopeHelper: ScopeHelper;
  git: GitHelper;
  constructor() {
    this.debugMode = !!process.env.npm_config_debug; // default = false
    this.scopes = new ScopesData(); // generates dirs and scope names
    this.bitJson = new BitJsonHelper(this.scopes);
    this.bitJsonc = new BitJsoncHelper(this.scopes);
    this.packageJson = new PackageJsonHelper(this.scopes);
    this.fs = new FsHelper(this.scopes);
    this.command = new CommandHelper(this.scopes, this.debugMode);
    this.bitMap = new BitMapHelper(this.scopes, this.fs);
    this.config = new ConfigHelper(this.command);
    this.npm = new NpmHelper(this.scopes, this.fs, this.command);
    this.scopeHelper = new ScopeHelper(this.debugMode, this.scopes, this.command, this.fs);
    this.git = new GitHelper(this.scopes, this.command, this.scopeHelper);
    this.fixtures = new FixtureHelper(this.fs, this.command, this.npm, this.scopes, this.debugMode, this.packageJson);
    this.extensions = new ExtensionsHelper(
      this.scopes,
      this.command,
      this.bitJsonc,
      this.scopeHelper,
      this.fixtures,
      this.fs
    );
    this.env = new EnvHelper(this.command, this.fs, this.scopes, this.scopeHelper, this.fixtures);
    this.general = new GeneralHelper(this.scopes, this.npm, this.command);
  }
}

export function ensureAndWriteJson(filePath: string, fileContent: any) {
  fs.ensureFileSync(filePath);
  fs.writeJsonSync(filePath, fileContent, { spaces: 2 });
}

export const FileStatusWithoutChalk = R.fromPairs(
  Object.keys(FileStatus).map(status => [status, removeChalkCharacters(FileStatus[status])])
);

export { VERSION_DELIMITER };
