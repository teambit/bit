// @flow
import path from 'path';
import fs from 'fs-extra';
import CommandHelper from './e2e-command-helper';
import FsHelper from './e2e-fs-helper';
import { generateRandomStr, ensureAndWriteJson } from './e2e-helper';
import ScopeHelper from './e2e-scope-helper';
import FixtureHelper from './e2e-fixtures-helper';
import ScopesData from './e2e-scopes';

export default class EnvHelper {
  command: CommandHelper;
  fs: FsHelper;
  fixtures: FixtureHelper;
  scopes: ScopesData;
  scopeHelper: ScopeHelper;
  compilerCreated: boolean = false;
  dummyCompilerCreated: boolean;
  dummyTesterCreated: boolean;
  constructor(
    command: CommandHelper,
    fsHelper: FsHelper,
    scopes: ScopesData,
    scopeHelper: ScopeHelper,
    fixtures: FixtureHelper
  ) {
    this.command = command;
    this.fs = fsHelper;
    this.scopes = scopes;
    this.scopeHelper = scopeHelper;
    this.fixtures = fixtures;
  }

  importCompiler(id?: string) {
    if (!id) {
      id = `${this.scopes.env}/compilers/babel`;
      this.createCompiler();
    }
    // Temporary - for checking new serialization against the stage env
    // this.helper.config.setHubDomain(`hub-stg.${BASE_WEB_DOMAIN}`);
    return this.command.runCmd(`bit import ${id} --compiler`);
  }

  importDummyCompiler(dummyType?: string = 'dummy') {
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

  importDummyTester(dummyType?: string = 'dummy') {
    const id = `${this.scopes.env}/testers/dummy`;
    this.createDummyTester(dummyType);
    return this.command.runCmd(`bit import ${id} --tester`);
  }

  importTester(id: string) {
    // Temporary - for checking new serialization against the stage env
    // this.helper.config.setHubDomain(`hub-stg.${BASE_WEB_DOMAIN}`);
    this.command.runCmd(`bit import ${id} --tester`);
  }

  createDummyCompiler(dummyType: string = 'dummy') {
    // if (this.dummyCompilerCreated) return this.scope.addRemoteScope(this.scopes.envScopePath);

    // TODO: this is not really a scope but a workspace
    const tempScope = `${generateRandomStr()}-temp`;
    const tempScopePath = path.join(this.scopes.e2eDir, tempScope);
    fs.emptyDirSync(tempScopePath);

    this.scopeHelper.initWorkspace(tempScopePath);

    const sourceDir = path.join(this.fixtures.getFixturesDir(), 'compilers', dummyType);
    const compiler = fs.readFileSync(path.join(sourceDir, 'compiler.js'), 'utf-8');
    fs.writeFileSync(path.join(tempScopePath, 'compiler.js'), compiler);

    this.command.runCmd('bit add compiler.js -i compilers/dummy', tempScopePath);
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
        chai: '4.2.0'
      }
    });
    this.command.runCmd('npm install', tempScopePath);
    this.command.runCmd('bit add tester.js -i testers/dummy', tempScopePath);
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
      version: '6.23.0'
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

    this.command.runCmd('bit add compiler.js -i compilers/babel', tempScopePath);
    this.command.runCmd('bit tag compilers/babel -m msg', tempScopePath);

    fs.emptyDirSync(this.scopes.envPath);
    this.command.runCmd('bit init --bare', this.scopes.envPath);
    this.command.runCmd(`bit remote add file://${this.scopes.envPath}`, tempScopePath);
    this.command.runCmd(`bit export ${this.scopes.env} compilers/babel`, tempScopePath);
    this.scopeHelper.addRemoteScope(this.scopes.envPath);
    this.compilerCreated = true;
    return true;
  }
}
