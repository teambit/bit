import chalk from 'chalk';
import fs from 'fs-extra';
import { capitalize } from 'lodash';
import * as path from 'path';
import tar from 'tar';

import * as fixtures from './fixtures';
import CommandHelper from './e2e-command-helper';
import FsHelper from './e2e-fs-helper';
import NpmHelper from './e2e-npm-helper';
import PackageJsonHelper from './e2e-package-json-helper';
import ScopeHelper from './e2e-scope-helper';
import ScopesData from './e2e-scopes';

export type GenerateEnvJsoncOptions = {
  extends?: string;
  policy?: Record<string, any>;
  patterns?: Record<string, string[]>;
};

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
    return this.command.addComponent('bar', { i: 'bar/foo' });
  }
  createComponentIsType() {
    this.fs.createFile('is-type', 'is-type.js');
  }
  addComponentUtilsIsType() {
    return this.command.addComponent('is-type', { i: 'utils/is-type' });
  }
  createComponentIsString(impl = fixtures.isStringHarmony) {
    this.fs.createFile('is-string', 'is-string.js', impl);
  }
  addComponentUtilsIsString() {
    return this.command.addComponent('is-string', { i: 'utils/is-string' });
  }
  tagComponentBarFoo() {
    return this.command.tagWithoutBuild('bar/foo');
  }
  getFixturesDir() {
    return path.join(__dirname, '../excluded-fixtures');
  }

  copyFixtureDir(src: string, dest: string) {
    const sourceDir = path.join(this.getFixturesDir(), src);
    const actualSource = fs.lstatSync(sourceDir).isSymbolicLink() ? fs.realpathSync(sourceDir) : sourceDir;

    if (this.debugMode) console.log(chalk.green(`copying fixture dir ${actualSource} to ${dest}\n`)); // eslint-disable-line
    fs.copySync(actualSource, dest, { dereference: true });
  }

  copyFixtureComponents(dir = '', dest: string = path.join(this.scopes.localPath, dir)) {
    const sourceDir = path.join(this.getFixturesDir(), 'components', dir);
    fs.copySync(sourceDir, dest);
  }

  copyFixtureExtensions(dir = '', cwd: string = this.scopes.localPath, targetFolder?: string) {
    const sourceDir = path.join(this.getFixturesDir(), 'extensions', dir);
    const target = path.join(cwd, targetFolder || dir);
    fs.copySync(sourceDir, target, { dereference: true });

    // remove "// @bit-no-check" from the files
    const files = fs.readdirSync(target);
    files.forEach((file) => {
      if (!file.endsWith('.ts') && !file.endsWith('.js')) return;
      const filePath = path.join(target, file);
      let fileContent = fs.readFileSync(filePath, 'utf8');
      fileContent = fileContent.replace('// @bit-no-check', '');
      fs.writeFileSync(filePath, fileContent);
    });
  }

  copyFixtureFile(pathToFile = '', newName: string = path.basename(pathToFile), cwd: string = this.scopes.localPath) {
    const sourceFile = path.join(this.getFixturesDir(), pathToFile);
    const distFile = path.join(cwd, newName);
    const actualSource = fs.lstatSync(sourceFile).isSymbolicLink() ? fs.realpathSync(sourceFile) : sourceFile;

    if (this.debugMode) console.log(chalk.green(`copying fixture ${actualSource} to ${distFile}\n`)); // eslint-disable-line
    fs.copySync(actualSource, distFile);
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
  populateComponents(numOfComponents = 3, rewire = true, additionalStr = '', compile = true, esm = false): string {
    for (let i = 1; i <= numOfComponents; i += 1) {
      let content;
      if (!esm) {
        content = this.getCjsImplForPopulate(numOfComponents, i, additionalStr);
      } else {
        content = this.getEsmImplForPopulate(numOfComponents, i, additionalStr);
      }
      this.fs.outputFile(path.join(`comp${i}`, `index.js`), content);
      this.command.addComponent(`comp${i}`);
    }
    let appContent = "const comp1 = require('./comp1');\nconsole.log(comp1())";
    if (esm) {
      appContent = "import comp1 from './comp1';\nconsole.log(comp1())";
    }
    this.fs.outputFile('app.js', appContent);
    if (rewire) {
      this.command.linkAndRewire();
    }
    if (compile) this.command.compile();
    return Array(numOfComponents)
      .fill(null)
      .map((val, key) => `comp${key + 1}${additionalStr}`)
      .join(' and ');
  }

  private getCjsImplForPopulate(numOfComponents: number, index: number, additionalStr = ''): string {
    if (index === numOfComponents) return `module.exports = () => 'comp${index}${additionalStr}';`;
    const nextComp = `comp${index + 1}`;
    return `const ${nextComp} = require('../${nextComp}');

module.exports = () => \`comp${index}${additionalStr} and $\{${nextComp}()}\`;`;
  }

  private getEsmImplForPopulate(numOfComponents: number, index: number, additionalStr = ''): string {
    if (index === numOfComponents)
      return `export default function(){
return 'comp${index}${additionalStr}';
}`;
    const nextComp = `comp${index + 1}`;
    return `import ${nextComp} from '../${nextComp}';
module.exports = () => 'comp${index}${additionalStr} and ' + ${nextComp}();`;
  }

  /**
   * This will populate extensions that does nothing
   * its purpose is to check different config merges
   *
   * @param {number} [numOfExtensions=3]
   * @returns {string}
   * @memberof FixtureHelper
   */
  populateExtensions(numOfExtensions = 3, printNameInProvider = false): void {
    const aspectImp = (index) => {
      return `
      import { Aspect } from '@teambit/harmony';

      export const Ext${index}Aspect = Aspect.create({
        id: 'my-scope/ext${index}',
        dependencies: [],
        defaultConfig: {},
      });
      export default Ext${index}Aspect;

      `;
    };
    const mainImp = (index) => {
      let provider = `static async provider(_deps, config) {
        return new Ext${index}Main(config);
      }`;
      if (printNameInProvider) {
        provider = `static async provider(_deps, config) {
          const extMain = new Ext${index}Main(config);
          extMain.printName();
          return extMain;
        }`;
      }
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
        ${provider}
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

  generateEnvJsoncFile(componentDir: string, options: GenerateEnvJsoncOptions = {}) {
    const envJsoncFile = path.join(componentDir, 'env.jsonc');
    const defaultPatterns = {
      compositions: ['**/*.composition.*', '**/*.preview.*'],
      docs: ['**/*.docs.*'],
      tests: ['**/*.spec.*', '**/*.test.*'],
    };
    const envJsoncFileContentJson: GenerateEnvJsoncOptions = {
      policy: options.policy || {},
      patterns: options.patterns || defaultPatterns,
    };
    if (options.extends) {
      envJsoncFileContentJson.extends = options.extends;
    }
    this.fs.outputFile(envJsoncFile, JSON.stringify(envJsoncFileContentJson, null, 2));
  }

  populateEnvMainRuntime(
    filePathRelativeToLocalScope: string,
    { envName, dependencies }: { envName: string; dependencies: any }
  ): void {
    const capitalizedEnvName = capitalize(envName);
    return this.fs.outputFile(
      filePathRelativeToLocalScope,
      `
import { MainRuntime } from '@teambit/cli';
import { ReactAspect, ReactMain } from '@teambit/react';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { ${capitalizedEnvName}Aspect } from './${envName}.aspect';

export class ${capitalizedEnvName}Main {
  static slots = [];

  static dependencies = [ReactAspect, EnvsAspect];

  static runtime = MainRuntime;

  static async provider([react, envs]: [ReactMain, EnvsMain]) {
    const templatesReactEnv = envs.compose(react.reactEnv, [
      envs.override({
        getDependencies: () => (${JSON.stringify(dependencies)}),
      })
    ]);
    envs.registerEnv(templatesReactEnv);
    return new ${capitalizedEnvName}Main();
  }
}

${capitalizedEnvName}Aspect.addRuntime(${capitalizedEnvName}Main);
`
    );
  }
}
