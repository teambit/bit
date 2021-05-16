import chalk from 'chalk';
import fs from 'fs-extra';
import * as path from 'path';
import tar from 'tar';

import * as fixtures from '../../src/fixtures/fixtures';
import CommandHelper from './e2e-command-helper';
import FsHelper from './e2e-fs-helper';
import NpmHelper from './e2e-npm-helper';
import PackageJsonHelper from './e2e-package-json-helper';
import ScopeHelper from './e2e-scope-helper';
import ScopesData from './e2e-scopes';

export default class FixtureHelper {
  fs: FsHelper;
  command: CommandHelper;
  scopes: ScopesData;
  debugMode: boolean;
  npm: NpmHelper;
  packageJson: PackageJsonHelper;
  scopeHelper: ScopeHelper;

  constructor(
    fsHelper: FsHelper,
    commandHelper: CommandHelper,
    npmHelper: NpmHelper,
    scopes: ScopesData,
    debugMode: boolean,
    packageJson: PackageJsonHelper,
    scopeHelper: ScopeHelper
  ) {
    this.fs = fsHelper;
    this.command = commandHelper;
    this.npm = npmHelper;
    this.scopes = scopes;
    this.debugMode = debugMode;
    this.packageJson = packageJson;
    this.scopeHelper = scopeHelper;
  }
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  createComponentBarFoo(impl?: string = fixtures.fooFixture) {
    this.fs.createFile('bar', 'foo.js', impl);
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  createComponentUtilsIsType(impl?: string = fixtures.isType) {
    this.fs.createFile('utils', 'is-type.js', impl);
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  createComponentUtilsIsString(impl?: string = fixtures.isString) {
    this.fs.createFile('utils', 'is-string.js', impl);
  }

  addComponentBarFoo() {
    return this.command.addComponent('bar/foo.js', { i: 'bar/foo' });
  }

  addComponentBarFooAsDir() {
    return this.command.addComponent('bar', { i: 'bar/foo' });
  }

  addComponentUtilsIsType() {
    return this.command.addComponent('utils/is-type.js', { i: 'utils/is-type' });
  }

  addComponentUtilsIsString() {
    return this.command.addComponent('utils/is-string.js', { i: 'utils/is-string' });
  }

  tagComponentBarFoo() {
    return this.command.tagComponent('bar/foo');
  }
  getFixturesDir() {
    return path.join(__dirname, '../../e2e/fixtures');
  }

  copyFixtureDir(src: string, dest: string) {
    const sourceDir = path.join(this.getFixturesDir(), src);
    fs.copySync(sourceDir, dest);
  }

  copyFixtureComponents(dir = '', cwd: string = this.scopes.localPath) {
    const sourceDir = path.join(this.getFixturesDir(), 'components', dir);
    fs.copySync(sourceDir, cwd);
  }

  copyFixtureExtensions(dir = '', cwd: string = this.scopes.localPath) {
    const sourceDir = path.join(this.getFixturesDir(), 'extensions', dir);
    const target = path.join(cwd, dir);
    fs.copySync(sourceDir, target);
  }

  copyFixtureFile(pathToFile = '', newName: string = path.basename(pathToFile), cwd: string = this.scopes.localPath) {
    const sourceFile = path.join(this.getFixturesDir(), pathToFile);
    const distFile = path.join(cwd, newName);
    if (this.debugMode) console.log(chalk.green(`copying fixture ${sourceFile} to ${distFile}\n`)); // eslint-disable-line
    fs.copySync(sourceFile, distFile);
  }

  /**
   * populates the local workspace with the following components:
   * 'bar/foo'         => requires a file from 'utils/is-string' component
   * 'utils/is-string' => requires a file from 'utils/is-type' component
   * 'utils/is-type'
   * in other words, the dependency chain is: bar/foo => utils/is-string => utils/is-type
   */
  populateWorkspaceWithThreeComponents() {
    this.fs.createFile('utils', 'is-type.js', fixtures.isType);
    this.addComponentUtilsIsType();
    this.fs.createFile('utils', 'is-string.js', fixtures.isString);
    this.addComponentUtilsIsString();
    this.createComponentBarFoo(fixtures.barFooFixture);
    this.addComponentBarFoo();
  }

  populateWorkspaceWithComponentsWithV2() {
    this.fs.createFile('utils', 'is-type.js', fixtures.isTypeV2);
    this.addComponentUtilsIsType();
    this.fs.createFile('utils', 'is-string.js', fixtures.isStringV2);
    this.addComponentUtilsIsString();
    this.createComponentBarFoo(fixtures.barFooFixtureV2);
    this.addComponentBarFoo();
  }

  populateWorkspaceWithThreeComponentsAndModulePath(useDefaultScope = true) {
    this.fs.createFile('utils', 'is-type.js', fixtures.isType);
    this.addComponentUtilsIsType();

    const isStringFixture = useDefaultScope
      ? fixtures.isStringModulePath(this.scopes.remote)
      : fixtures.isStringModulePathNoScope;
    this.fs.createFile('utils', 'is-string.js', isStringFixture);
    this.addComponentUtilsIsString();

    const barFooFixture = useDefaultScope
      ? fixtures.barFooModulePath(this.scopes.remote)
      : fixtures.barFooModulePathNoScope;
    this.createComponentBarFoo(barFooFixture);
    this.addComponentBarFoo();
  }

  /**
   * @deprecated use populateWorkspaceWithThreeComponents()
   */
  populateWorkspaceWithComponents() {
    this.populateWorkspaceWithThreeComponents();
  }

  /**
   * important: use only this function. ignore other populateWorkspaceWith* functions, they're for
   * legacy code (which adds files instead of directory).
   *
   * it creates and adds components that require each other.
   * e.g. when creating 3 components, the workspace is: comp1 => comp2 => comp3.
   * meaning, comp1 requires comp2 and comp2 requires comp2.
   *
   * it also adds app.js file.
   * in the case of the 3 components above, the output is: "comp1 and comp2 and comp3".
   *
   * @returns the expected output in case "node app.js" is running
   */
  populateComponents(numOfComponents = 3, rewire = true, additionalStr = '', compile = true): string {
    const getImp = (index) => {
      if (index === numOfComponents) return `module.exports = () => 'comp${index}${additionalStr}';`;
      const nextComp = `comp${index + 1}`;
      return `const ${nextComp} = require('../${nextComp}');
module.exports = () => 'comp${index}${additionalStr} and ' + ${nextComp}();`;
    };
    for (let i = 1; i <= numOfComponents; i += 1) {
      this.fs.outputFile(path.join(`comp${i}`, `index.js`), getImp(i));
      this.command.addComponent(`comp${i}`);
    }
    this.fs.outputFile('app.js', "const comp1 = require('./comp1');\nconsole.log(comp1())");
    if (rewire) {
      this.command.linkAndRewire();
    }
    if (compile) this.command.compile();
    return Array(numOfComponents)
      .fill(null)
      .map((val, key) => `comp${key + 1}${additionalStr}`)
      .join(' and ');
  }

  /**
   * This will populate extensions that does nothing
   * its purpose is to check different config merges
   *
   * @param {number} [numOfExtensions=3]
   * @returns {string}
   * @memberof FixtureHelper
   */
  populateExtensions(numOfExtensions = 3): void {
    const aspectImp = (index) => {
      return `
      import { Aspect } from '@teambit/bit';

      export const Ext${index}Aspect = Aspect.create({
        id: 'my-scope/ext${index}',
        dependencies: [],
        defaultConfig: {},
      });
      export default Ext${index}Aspect;

      `;
    };
    const mainImp = (index) => {
      return `
      import { MainRuntime } from '@teambit/cli';
      import { Ext${index}Aspect } from './ext${index}.aspect';

      export class Ext${index}Main {
        static runtime: any = MainRuntime;
        static dependencies: any = [];


        constructor(public config: any) {}

        printName() {
          console.log('ext ${index}');
        }
        static async provider(_deps, config) {
          return new Ext${index}Main(config);
        }
      }
      export default Ext${index}Main;
      Ext${index}Aspect.addRuntime(Ext${index}Main);
      `;
    };
    for (let i = 1; i <= numOfExtensions; i += 1) {
      const aspectFileName = `ext${i}.aspect.ts`;
      this.fs.outputFile(path.join('extensions', `ext${i}`, aspectFileName), aspectImp(i));
      this.fs.outputFile(path.join('extensions', `ext${i}`, `ext${i}.main.runtime.ts`), mainImp(i));
      this.command.addComponent(`extensions/ext${i}`, { m: aspectFileName });
    }
    // this.scopeHelper.linkBitLegacy();
    // this.npm.installNpmPackage('@teambit/harmony');
  }

  populateComponentsTS(numOfComponents = 3, owner = '@bit', isHarmony = true): string {
    let nmPathPrefix = `${owner}/${this.scopes.remote}.`;
    if (isHarmony) {
      const remoteSplit = this.scopes.remote.split('.');
      if (remoteSplit.length === 1) {
        nmPathPrefix = `@${this.scopes.remote}/`;
      } else {
        nmPathPrefix = `@${remoteSplit[0]}/${remoteSplit[1]}.`;
      }
    }
    const getImp = (index) => {
      if (index === numOfComponents) return `export default () => 'comp${index}';`;
      const nextComp = `comp${index + 1}`;
      return `import ${nextComp} from '${nmPathPrefix}${nextComp}';
export default () => 'comp${index} and ' + ${nextComp}();`;
    };
    for (let i = 1; i <= numOfComponents; i += 1) {
      this.fs.outputFile(path.join(`comp${i}`, `index.ts`), getImp(i));
    }
    for (let i = numOfComponents; i > 0; i -= 1) {
      this.command.addComponent(`comp${i}`);
    }
    this.command.link();
    this.fs.outputFile('app.js', `const comp1 = require('${nmPathPrefix}comp1').default;\nconsole.log(comp1())`);
    this.command.compile();
    return Array(numOfComponents)
      .fill(null)
      .map((val, key) => `comp${key + 1}`)
      .join(' and ');
  }

  /**
   * populates the local workspace with the following components:
   * 'utils/is-string' => requires a file from 'utils/is-type' component
   * 'utils/is-type'
   * in other words, the dependency chain is: utils/is-string => utils/is-type
   */
  populateWorkspaceWithTwoComponents() {
    this.fs.createFile('utils', 'is-type.js', fixtures.isType);
    this.addComponentUtilsIsType();
    this.fs.createFile('utils', 'is-string.js', fixtures.isString);
    this.addComponentUtilsIsString();
  }

  /**
   * populates the local workspace with the one component "utils/is-type".
   */
  populateWorkspaceWithUtilsIsType() {
    this.fs.createFile('utils', 'is-type.js', fixtures.isType);
    this.addComponentUtilsIsType();
  }

  /**
   * populates the local workspace with the following components:
   * 'bar/foo'         => requires a file from 'utils/is-string' component
   * 'utils/is-string' => requires a file from 'utils/is-type' component
   * 'utils/is-type'   => requires the left-pad package
   * in other words, the dependency chain is: bar/foo => utils/is-string => utils/is-type => left-pad
   */
  populateWorkspaceWithComponentsAndPackages() {
    this.npm.initNpm();
    this.npm.installNpmPackage('left-pad', '1.3.0');
    this.fs.createFile('utils', 'is-type.js', fixtures.isTypeLeftPad);
    this.addComponentUtilsIsType();
    this.fs.createFile('utils', 'is-string.js', fixtures.isString);
    this.addComponentUtilsIsString();
    this.createComponentBarFoo(fixtures.barFooFixture);
    this.addComponentBarFoo();
  }

  addExtensionTS() {
    const extensionsDir = path.join(__dirname, '..', 'extensions');
    const extDestination = path.join(this.scopes.localPath, 'extensions');
    fs.copySync(path.join(extensionsDir, 'typescript'), path.join(extDestination, 'typescript'));

    this.command.addComponent('extensions/typescript', { i: 'extensions/typescript' });

    this.npm.initNpm();
    const dependencies = {
      typescript: '^3.8',
    };

    this.packageJson.addKeyValue({ dependencies });
    this.command.link();

    // @todo: currently, the defaultScope is not enforced, so unless the extension is exported
    // first, the full-id won't be recognized when loading the extension.
    // once defaultScope is mandatory, make sure this is working without the next two lines
    this.command.tagComponent('extensions/typescript');
    this.command.exportComponent('extensions/typescript');
  }

  /**
   * extract the global-remote g-zipped scope into the e2e-test, so it'll be ready to consume.
   * this is an alternative to import directly from bit-dev.
   *
   * to add more components to the .tgz file, extract it, add it as a remote, then from your
   * workspace import the component you want and fork it into this remote, e.g.
   * # extract the file into `/tmp` so then the scope is in `/tmp/global-remote`.
   * cp e2e/fixtures/scopes/global-remote.tgz /tmp/
   * cd tmp && tar -xzvf global-remote.tgz
   * # go to your workspace and run the following
   * bit remote add file:///tmp/global-remote
   * bit import bit.envs/compilers/typescript
   * bit export global-remote bit.envs/compilers/typescript --include-dependencies --force --rewire
   * # then, cd into /tmp and tar the directory
   * cd /tmp && tar -czf global-remote.tgz global-remote
   * # copy the file to the fixtures/scopes directory.
   * cp /tmp/global-remote.tgz e2e/fixtures/scopes/
   */
  ensureGlobalRemoteScope() {
    if (fs.existsSync(this.scopes.globalRemotePath)) return;
    const scopeFile = path.join(this.getFixturesDir(), 'scopes', 'global-remote.tgz');
    tar.extract({
      sync: true,
      file: scopeFile,
      cwd: this.scopes.e2eDir,
    });
  }

  extractCompressedFixture(filePathRelativeToFixtures: string, destDir: string) {
    fs.ensureDirSync(destDir);
    const compressedFile = path.join(this.getFixturesDir(), filePathRelativeToFixtures);
    tar.extract({
      sync: true,
      file: compressedFile,
      cwd: destDir,
    });
  }
}
