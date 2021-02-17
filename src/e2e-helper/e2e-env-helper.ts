import fs from 'fs-extra';
import * as path from 'path';

import { generateRandomStr } from '../utils';
import CommandHelper from './e2e-command-helper';
import ExtensionsHelper from './e2e-extensions-helper';
import FixtureHelper from './e2e-fixtures-helper';
import FsHelper from './e2e-fs-helper';
import { ensureAndWriteJson } from './e2e-helper';
import ScopeHelper from './e2e-scope-helper';
import ScopesData from './e2e-scopes';

export default class EnvHelper {
  command: CommandHelper;
  fs: FsHelper;
  fixtures: FixtureHelper;
  scopes: ScopesData;
  scopeHelper: ScopeHelper;
  compilerCreated = false;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  dummyCompilerCreated: boolean;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  dummyTesterCreated: boolean;
  extensions: ExtensionsHelper;
  constructor(
    command: CommandHelper,
    fsHelper: FsHelper,
    scopes: ScopesData,
    scopeHelper: ScopeHelper,
    fixtures: FixtureHelper,
    extensions: ExtensionsHelper
  ) {
    this.command = command;
    this.fs = fsHelper;
    this.scopes = scopes;
    this.scopeHelper = scopeHelper;
    this.fixtures = fixtures;
    this.extensions = extensions;
  }

  importCompiler(id?: string) {
    if (!id) {
      id = `${this.scopes.env}/compilers/babel`;
      this.createCompiler();
    }
    return this.command.runCmd(`bit import ${id} --compiler`);
  }

  importTypescriptCompiler(version = '3.0.0') {
    this.fixtures.ensureGlobalRemoteScope();
    this.scopeHelper.addGlobalRemoteScope();
    return this.importCompiler(`${this.scopes.globalRemote}/compilers/typescript@${version}`);
  }

  getTypeScriptSettingsForES5() {
    return {
      rawConfig: {
        tsconfig: {
          compilerOptions: {
            target: 'ES5',
            module: 'CommonJS',
          },
        },
      },
    };
  }

  importDummyCompiler(dummyType = 'dummy') {
    const id = `${this.scopes.env}/compilers/dummy`;
    this.createDummyCompiler(dummyType);
    return this.command.runCmd(`bit import ${id} --compiler`);
  }

  changeDummyCompilerCode(originalCode: string, replaceTo: string) {
    const compilerPath = path.join('.bit/components/compilers/dummy', this.scopes.env, '0.0.1/compiler.js');
    const compilerContent = this.fs.readFile(compilerPath);
    const changedCompiler = compilerContent.replace(originalCode, replaceTo);
    this.fs.outputFile(compilerPath, changedCompiler);
  }

  importDummyTester(dummyType = 'dummy') {
    const id = `${this.scopes.env}/testers/dummy`;
    this.createDummyTester(dummyType);
    return this.command.runCmd(`bit import ${id} --tester`);
  }

  importTester(id = `${this.scopes.globalRemote}/testers/mocha@0.0.12`) {
    this.fixtures.ensureGlobalRemoteScope();
    this.scopeHelper.addGlobalRemoteScope();
    this.command.runCmd(`bit import ${id} --tester`);
  }

  createDummyCompiler(dummyType = 'dummy') {
    // if (this.dummyCompilerCreated) return this.scope.addRemoteScope(this.scopes.envScopePath);

    // TODO: this is not really a scope but a workspace
    const tempScope = `${generateRandomStr()}-temp`;
    const tempScopePath = path.join(this.scopes.e2eDir, tempScope);
    fs.emptyDirSync(tempScopePath);

    this.scopeHelper.initWorkspace(tempScopePath);

    const sourceDir = path.join(this.fixtures.getFixturesDir(), 'compilers', dummyType);
    const compiler = fs.readFileSync(path.join(sourceDir, 'compiler.js'), 'utf-8');
    fs.writeFileSync(path.join(tempScopePath, 'compiler.js'), compiler);

    this.command.addComponent('compiler.js', { i: 'compilers/dummy' }, tempScopePath);
    this.command.runCmd('bit tag compilers/dummy -m msg', tempScopePath);

    fs.emptyDirSync(this.scopes.envPath);
    this.command.runCmd('bit init --bare', this.scopes.envPath);
    this.command.runCmd(`bit remote add file://${this.scopes.envPath}`, tempScopePath);
    this.command.runCmd(`bit export ${this.scopes.env} compilers/dummy`, tempScopePath);
    this.scopeHelper.addRemoteScope(this.scopes.envPath);
    this.dummyCompilerCreated = true;
    return true;
  }

  createDummyTester(dummyType: string) {
    if (this.dummyTesterCreated) return this.scopeHelper.addRemoteScope(this.scopes.envPath);

    // TODO: this is not really a scope but a workspace
    const tempScope = `${generateRandomStr()}-temp`;
    const tempScopePath = path.join(this.scopes.e2eDir, tempScope);
    fs.emptyDirSync(tempScopePath);

    this.scopeHelper.initWorkspace(tempScopePath);

    const sourceDir = path.join(this.fixtures.getFixturesDir(), 'testers', dummyType);
    const tester = fs.readFileSync(path.join(sourceDir, 'tester.js'), 'utf-8');
    fs.writeFileSync(path.join(tempScopePath, 'tester.js'), tester);

    ensureAndWriteJson(path.join(tempScopePath, 'package.json'), {
      name: 'dummy-compiler',
      version: '1.0.0',
      dependencies: {
        mocha: '6.1.4',
        chai: '4.2.0',
      },
    });
    this.command.runCmd('npm install', tempScopePath);
    this.command.addComponent('tester.js', { i: 'testers/dummy' }, tempScopePath);
    this.command.runCmd('bit tag testers/dummy -m msg', tempScopePath);

    fs.emptyDirSync(this.scopes.envPath);
    this.command.runCmd('bit init --bare', this.scopes.envPath);
    this.command.runCmd(`bit remote add file://${this.scopes.envPath}`, tempScopePath);
    this.command.runCmd(`bit export ${this.scopes.env} testers/dummy`, tempScopePath);
    this.scopeHelper.addRemoteScope(this.scopes.envPath);
    this.dummyTesterCreated = true;
    return true;
  }

  createCompiler() {
    if (this.compilerCreated) return this.scopeHelper.addRemoteScope(this.scopes.envPath);

    const tempScope = `${generateRandomStr()}-temp`;
    const tempScopePath = path.join(this.scopes.e2eDir, tempScope);
    fs.emptyDirSync(tempScopePath);

    this.scopeHelper.initWorkspace(tempScopePath);

    const sourceDir = path.join(this.fixtures.getFixturesDir(), 'compilers', 'babel');
    const compiler = fs.readFileSync(path.join(sourceDir, 'compiler.js'), 'utf-8');
    fs.writeFileSync(path.join(tempScopePath, 'compiler.js'), compiler);

    const babelCorePackageJson = { name: 'babel-core', version: '6.25.0' };
    const babelPluginTransformObjectRestSpreadPackageJson = {
      name: 'babel-plugin-transform-object-rest-spread',
      version: '6.23.0',
    };
    const babelPresetLatestPackageJson = { name: 'babel-preset-latest', version: '6.24.1' };
    const vinylPackageJson = { name: 'vinyl', version: '2.1.0' };

    const nodeModulesDir = path.join(tempScopePath, 'node_modules');

    ensureAndWriteJson(path.join(nodeModulesDir, 'babel-core', 'package.json'), babelCorePackageJson);
    ensureAndWriteJson(
      path.join(nodeModulesDir, 'babel-plugin-transform-object-rest-spread', 'package.json'),
      babelPluginTransformObjectRestSpreadPackageJson
    );
    ensureAndWriteJson(path.join(nodeModulesDir, 'babel-preset-latest', 'package.json'), babelPresetLatestPackageJson);
    ensureAndWriteJson(path.join(nodeModulesDir, 'vinyl', 'package.json'), vinylPackageJson);

    ensureAndWriteJson(path.join(nodeModulesDir, 'babel-core', 'index.js'), '');
    ensureAndWriteJson(path.join(nodeModulesDir, 'babel-plugin-transform-object-rest-spread', 'index.js'), '');
    ensureAndWriteJson(path.join(nodeModulesDir, 'babel-preset-latest', 'index.js'), '');
    ensureAndWriteJson(path.join(nodeModulesDir, 'vinyl', 'index.js'), '');

    this.command.addComponent('compiler.js', { i: 'compilers/babel' }, tempScopePath);
    this.command.runCmd('bit tag compilers/babel -m msg', tempScopePath);

    fs.emptyDirSync(this.scopes.envPath);
    this.command.runCmd('bit init --bare', this.scopes.envPath);
    this.command.runCmd(`bit remote add file://${this.scopes.envPath}`, tempScopePath);
    this.command.runCmd(`bit export ${this.scopes.env} compilers/babel`, tempScopePath);
    this.scopeHelper.addRemoteScope(this.scopes.envPath);
    this.compilerCreated = true;
    return true;
  }

  /**
   * set up a new environment with two compilers, babel for the dists and ts for the d.ts files
   * returns the env name.
   */
  setBabelWithTsHarmony(): string {
    const EXTENSIONS_BASE_FOLDER = 'multiple-compilers-env';
    this.fixtures.copyFixtureExtensions(EXTENSIONS_BASE_FOLDER);
    this.command.addComponent(EXTENSIONS_BASE_FOLDER);
    this.extensions.addExtensionToVariant(EXTENSIONS_BASE_FOLDER, 'teambit.harmony/aspect');
    this.scopeHelper.linkBitLegacy();
    this.command.link();
    this.extensions.addExtensionToVariant(EXTENSIONS_BASE_FOLDER, 'teambit.dependencies/dependency-resolver', {
      policy: {
        dependencies: {
          '@babel/runtime': '^7.8.4',
          '@babel/core': '7.11.6',
          '@babel/preset-env': '7.11.5',
          '@babel/preset-typescript': '7.10.4',
          '@babel/plugin-proposal-class-properties': '7.10.4',
        },
      },
    });
    this.command.install();
    this.command.compile();
    return EXTENSIONS_BASE_FOLDER;
  }

  setCustomEnv(): string {
    const EXTENSIONS_BASE_FOLDER = 'node-env';
    this.fixtures.copyFixtureExtensions(EXTENSIONS_BASE_FOLDER);
    this.command.addComponent(EXTENSIONS_BASE_FOLDER);
    this.extensions.addExtensionToVariant(EXTENSIONS_BASE_FOLDER, 'teambit.harmony/aspect');
    this.scopeHelper.linkBitLegacy();
    this.command.link();
    this.command.install();
    this.command.compile();
    return EXTENSIONS_BASE_FOLDER;
  }
}
