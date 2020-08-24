import chai, { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';

import { BIT_WORKSPACE_TMP_DIRNAME, COMPILER_ENV_TYPE, TESTER_ENV_TYPE } from '../../src/constants';
import { MissingBitMapComponent } from '../../src/consumer/bit-map/exceptions';
import EjectNoDir from '../../src/consumer/component-ops/exceptions/eject-no-dir';
import EjectBoundToWorkspace from '../../src/consumer/component/exceptions/eject-bound-to-workspace';
import InjectNonEjected from '../../src/consumer/component/exceptions/inject-non-ejected';
import { _verboseMsg as abstractVinylVerboseMsg } from '../../src/consumer/component/sources/abstract-vinyl';
import GeneralHelper from '../../src/e2e-helper/e2e-general-helper';
import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';
import ExtensionLoadError from '../../src/legacy-extensions/exceptions/extension-load-error';
import ExtensionSchemaError from '../../src/legacy-extensions/exceptions/extension-schema-error';

chai.use(require('chai-fs'));
chai.use(require('chai-string'));

// TODO: backward compatibility
// should support declare env in old format (string)
// should not show component in modified if the compiler defined in old format (string)
// should not show components as modified for consumer bit.json in old format
// should not show components as modified for component with old model format

// TODO: Tests
// should skip the test running if --skip-test flag provided during tag (move to tag.e2e)
// test with dynamicPackageDependencies should work (make sure the dynamicPackageDependencies are resolved correctly)
// in the compiler used in these tests, the config "valToDynamic", always return the same value "dyanamicValue"
// don't try to change this val and expect to be changed. use other vals.

// Skip this for now since we removed many features these tests requires
// It should be re-written
describe.skip('envs', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  const compilerId = 'compilers/new-babel';
  const testerId = 'testers/new-mocha';
  let authorScopeBeforeExport;
  let authorScopeBeforeChanges;
  let remoteScopeBeforeChanges;
  before(() => {
    helper.scopeHelper.setNewLocalAndRemoteScopes();
    const compiler = path.join('compilers', 'new-babel', 'compiler.js');
    helper.fixtures.copyFixtureFile(compiler);
    helper.command.addComponent('compiler.js', {
      i: compilerId,
    });
    const tester = path.join('testers', 'new-mocha', 'tester.js');
    helper.fixtures.copyFixtureFile(tester);
    helper.command.addComponent('tester.js', {
      i: testerId,
    });
    helper.scopeHelper.reInitEnvsScope();
    helper.scopeHelper.addRemoteEnvironment();
    helper.npm.addNpmPackage('babel-core', '6.26.3');
    helper.npm.addNpmPackage('fs-extra', '5.0.0');
    helper.npm.addNpmPackage('mocha', '5.1.1');
    helper.npm.addNpmPackage('vinyl', '2.1.0');
    helper.npm.addNpmPackage('resolve', '1.7.1');
    helper.command.tagAllComponents();
    helper.command.exportAllComponents(helper.scopes.env);
    helper.scopeHelper.reInitLocalScope();
    helper.scopeHelper.addRemoteScope();
    helper.npm.initNpm();
    helper.scopeHelper.addRemoteEnvironment();
    helper.env.importCompiler(`${helper.scopes.env}/${compilerId}`);
    helper.env.importTester(`${helper.scopes.env}/${testerId}`);
    const babelrcFixture = path.join('compilers', 'new-babel', '.babelrc');
    helper.fixtures.copyFixtureFile(babelrcFixture);
    // helper.bitJson.addFileToEnv(undefined, '.babelrc', './.babelrc', COMPILER_ENV_TYPE);
    helper.bitJson.addToRawConfigOfEnv(undefined, 'a', 'b', COMPILER_ENV_TYPE);
    helper.bitJson.addToRawConfigOfEnv(undefined, 'valToDynamic', 'valToDynamic', COMPILER_ENV_TYPE);
    helper.fs.createFile('', 'mocha-config.opts', '{"someConfKey": "someConfVal"}');
    // helper.bitJson.addFileToEnv(undefined, 'config', './mocha-config.opts', TESTER_ENV_TYPE);
    helper.bitJson.addToRawConfigOfEnv(undefined, 'a', 'b', TESTER_ENV_TYPE);
    helper.bitJson.addToRawConfigOfEnv(undefined, 'valToDynamic', 'valToDynamic', TESTER_ENV_TYPE);
    helper.fs.createFile('', 'objRestSpread.js', fixtures.objectRestSpread);
    helper.fs.createFile('', 'pass.spec.js', fixtures.passTest);
    helper.command.addComponent('objRestSpread.js', {
      i: 'comp/my-comp',
      t: '"*.spec.js"',
      m: 'objRestSpread.js',
    });
    helper.fs.createFile('', 'comp2.js');
    helper.command.addComponent('comp2.js', { i: 'comp/my-comp2' });
    helper.npm.installNpmPackage('babel-plugin-transform-object-rest-spread', '6.26.0');
    helper.npm.installNpmPackage('babel-preset-env', '1.6.1');
    helper.npm.installNpmPackage('chai', '4.1.2');
    authorScopeBeforeExport = helper.scopeHelper.cloneLocalScope();
    helper.command.tagAllComponents();
    helper.command.exportAllComponents();
    authorScopeBeforeChanges = helper.scopeHelper.cloneLocalScope();
    remoteScopeBeforeChanges = helper.scopeHelper.cloneRemoteScope();
  });

  after(() => {
    helper.scopeHelper.destroy();
  });
  const envConfigOriginal = {
    a: 'b',
    valToDynamic: 'dyanamicValue',
  };
  const compilerConfigChanged = {
    a: 'compiler',
    valToDynamic: 'dyanamicValue',
  };
  const testerConfigChanged = {
    a: 'tester',
    valToDynamic: 'dyanamicValue',
  };
  describe('author environment', () => {
    // TODO: reimport component on author after changing file/config of its env in different project
    // (should load env from model)
    // TODO: reimport component on author after changing the component code in different project
    // And change the env config in the root bit.json (should load from root bit.json)

    let componentFilesystem;
    let compilerLoaded;
    let testerLoaded;
    let compilerPackageDependencies;
    let testerPackageDependencies;
    before(() => {
      componentFilesystem = helper.command.catComponent('comp/my-comp@0.0.1');
      compilerLoaded = componentFilesystem.compiler;
      testerLoaded = componentFilesystem.tester;
      compilerPackageDependencies = componentFilesystem.compilerPackageDependencies.devDependencies;
      testerPackageDependencies = componentFilesystem.testerPackageDependencies.devDependencies;
    });
    describe('storing envs metadata in the models for author', () => {
      it('should store the compiler name in the model', () => {
        expect(compilerLoaded.name).to.equal(`${helper.scopes.env}/${compilerId}@0.0.1`);
      });
      it('should store the tester name in the model', () => {
        expect(testerLoaded.name).to.equal(`${helper.scopes.env}/${testerId}@0.0.1`);
      });
      it('should store the compiler dynamic config in the model', () => {
        expect(compilerLoaded.config).to.include(envConfigOriginal);
      });
      it('should store the tester dynamic config in the model', () => {
        expect(testerLoaded.config).to.include(envConfigOriginal);
      });
      describe('should store the dynamicPackageDependencies to envPackageDependencies in the model', () => {
        it('should store the compiler dynamicPackageDependencies', () => {
          expect(compilerPackageDependencies).to.include({
            'babel-plugin-transform-object-rest-spread': '^6.26.0',
            'babel-preset-env': '^1.6.1',
          });
        });
        it('should store the tester dynamicPackageDependencies', () => {
          expect(testerPackageDependencies).to.include({
            'lodash.get': '4.4.2',
          });
        });
      });
    });
    it('should show the envPackageDependencies when running bit show', () => {
      const output = helper.command.showComponent('comp/my-comp');
      expect(output).to.have.string('babel-plugin-transform-object-rest-spread@^6.26.0');
      expect(output).to.have.string('babel-preset-env@^1.6.1');
      expect(output).to.have.string('lodash.get@4.4.2');
    });
    it('should build the component successfully', () => {
      const output = helper.command.buildComponentWithOptions('comp/my-comp', { v: '', '-no-cache': '' });
      const alignedOutput = GeneralHelper.alignOutput(output);
      expect(output).to.have.string(path.join('dist', 'objRestSpread.js.map'));
      expect(output).to.have.string(path.join('dist', 'objRestSpread.js'));
      expect(output).to.have.string(path.join('dist', 'objRestSpread.js'));
      const tmpFolder = path.join(helper.scopes.localPath, BIT_WORKSPACE_TMP_DIRNAME, 'comp/my-comp');
      expect(alignedOutput).to.not.have.string('writing config files to');
      const babelRcWriteMessage = abstractVinylVerboseMsg(path.join(tmpFolder, '.babelrc'), true);
      expect(alignedOutput).to.not.have.string(babelRcWriteMessage);
      expect(alignedOutput).to.not.have.string('deleting tmp directory');
      const distFilePath = path.join(helper.scopes.localPath, 'dist', 'objRestSpread.js');
      const distContent = fs.readFileSync(distFilePath).toString();
      expect(distContent).to.have.string(
        'var _extends=Object.assign||function(target){for(var i=1;i<arguments.length;i++){var source=arguments[i];for(var key in source){if(Object.prototype.hasOwnProperty.call(source,key)){target[key]=source[key]}}}return target};var g=5;var x={a:"a",b:"b"};var y={c:"c"};var z=_extends({},x,y);'
      );
    });

    describe('eject conf', () => {
      describe('negative tests', () => {
        it('should show error for authored component if it is not detached', () => {
          const error = new EjectBoundToWorkspace();
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          const ejectFunc = () => helper.command.ejectConf('comp/my-comp');
          helper.general.expectToThrow(ejectFunc, error);
        });
      });
    });

    describe('detach envs from consumer config', () => {
      let fullComponentFolder;
      let compId;
      before(() => {
        // Change the component envs in imported environment to make sure they are detached
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.scopeHelper.addRemoteEnvironment();
        helper.command.importComponentWithOptions('comp/my-comp', { '-conf': '' });
        fullComponentFolder = path.join(helper.scopes.localPath, 'components', 'comp', 'my-comp');
        helper.bitJson.addToRawConfigOfEnv(fullComponentFolder, 'a', 'compiler', COMPILER_ENV_TYPE);
        helper.bitJson.addToRawConfigOfEnv(fullComponentFolder, 'a', 'tester', TESTER_ENV_TYPE);
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();
        helper.scopeHelper.getClonedLocalScope(authorScopeBeforeChanges);
        helper.command.importComponent('comp/my-comp');
        compId = `${helper.scopes.remote}/comp/my-comp@0.0.2`;
        componentFilesystem = helper.command.showComponentParsed('comp/my-comp');
        compilerLoaded = componentFilesystem.compiler;
        testerLoaded = componentFilesystem.tester;
      });
      after(() => {
        helper.scopeHelper.getClonedRemoteScope(remoteScopeBeforeChanges);
      });
      it('should show error when trying to eject conf without path provided', () => {
        const error = new EjectNoDir(`${helper.scopes.remote}/comp/my-comp`);
        const ejectFunc = () => helper.command.ejectConf('comp/my-comp');
        helper.general.expectToThrow(ejectFunc, error);
      });
      it('should write the modified envs into consumer config overrides', () => {
        const bitJson = helper.bitJson.read();
        const compName = `${helper.scopes.remote}/comp/my-comp`;
        expect(bitJson.overrides).to.have.property(compName);
        expect(bitJson.overrides[compName]).to.have.property('env');
        expect(bitJson.overrides[compName].env).to.have.property('compiler');
        const compilerConfig =
          bitJson.overrides[compName].env.compiler[`${helper.scopes.env}/compilers/new-babel@0.0.1`];
        expect(compilerConfig.rawConfig).to.deep.equal(compilerConfigChanged);
        const testerConfig = bitJson.overrides[compName].env.tester[`${helper.scopes.env}/testers/new-mocha@0.0.1`];
        expect(testerConfig.rawConfig).to.deep.equal(testerConfigChanged);
      });
      it('should load the compiler from consumer config overrides', () => {
        expect(compilerLoaded.config).to.include(compilerConfigChanged);
      });
      it('should load the tester from consumer config overrides', () => {
        expect(testerLoaded.config).to.include(testerConfigChanged);
      });
      describe('tagging detached component', () => {
        before(() => {
          // Change the component
          helper.fs.createFile('', 'objRestSpread.js', 'const a = 3');
          helper.command.tagAllComponents();
          compId = `${helper.scopes.remote}/comp/my-comp@0.0.3`;
          componentFilesystem = helper.command.catComponent(compId);
        });
        it('should leave the overrides in the model as is (empty)', () => {
          expect(componentFilesystem).to.have.property('overrides').to.be.empty;
        });
        describe('attach back to consumer config', () => {
          before(() => {
            const bitJson = helper.bitJson.read();
            const compName = `${helper.scopes.remote}/comp/my-comp`;
            delete bitJson.overrides[compName];
            helper.bitJson.write(bitJson);
            componentFilesystem = helper.command.showComponentParsed('comp/my-comp');
            compilerLoaded = componentFilesystem.compiler;
            testerLoaded = componentFilesystem.tester;
          });
          it('should load the compiler from workspace bit.json after attach compiler back', () => {
            expect(compilerLoaded.config).to.include(envConfigOriginal);
          });
          it('should load the tester from workspace bit.json after attach tester back', () => {
            expect(testerLoaded.config).to.include(envConfigOriginal);
          });
          describe('tagging re-attached component', () => {
            before(() => {
              helper.command.tagAllComponents();
              compId = `${helper.scopes.remote}/comp/my-comp@0.0.4`;
              componentFilesystem = helper.command.catComponent(compId);
            });
            it('should save the compiler config according to the workspace config', () => {
              expect(componentFilesystem.compiler.config).to.include(envConfigOriginal);
            });
            it('should save the tester config according to the workspace config', () => {
              expect(componentFilesystem.tester.config).to.include(envConfigOriginal);
            });
          });
        });
      });
    });
    describe('testing components', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(authorScopeBeforeChanges);
      });
      describe('with success tests', () => {
        it('should show tests passed', () => {
          const output = helper.command.testComponent('comp/my-comp');
          expect(output).to.have.string('tests passed');
          expect(output).to.have.string('total duration');
          expect(output).to.have.string('✔ group of passed tests');
        });
      });
      describe('with failing tests', () => {
        before(() => {
          helper.fs.createFile('', 'fail.spec.js', fixtures.failTest);
          helper.command.addComponent('fail.spec.js', { i: 'comp/my-comp', t: 'fail.spec.js' });
        });
        describe('with default fork level', () => {
          it('should show results without define fork level', () => {
            let output;
            let statusCode;
            try {
              helper.command.testComponent('comp/my-comp');
            } catch (err) {
              output = err.stdout.toString();
              statusCode = err.status;
            }
            expect(statusCode).to.not.equal(0);
            expect(output).to.have.string('tests failed');
            expect(output).to.have.string('✔ group of passed tests');
            expect(output).to.have.string('✖ group of failed tests');
          });
          // Skip for now since this test anyway won't be relevant in harmony so not worth the time to fix it
          it.skip('should write config files to tmp directory', () => {
            let output;
            let statusCode;
            try {
              helper.command.testComponentWithOptions('comp/my-comp', { v: '' });
            } catch (err) {
              output = err.stdout.toString();
              statusCode = err.status;
            }
            expect(statusCode).to.not.equal(0);
            const alignedOuput = GeneralHelper.alignOutput(output);
            const tmpFolder = path.join(helper.scopes.localPath, BIT_WORKSPACE_TMP_DIRNAME, 'comp/my-comp');
            const writingRegEx = new RegExp('writing config files to', 'g');
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            const writingCount = (alignedOuput.match(writingRegEx) || []).length;
            // There should be 0 occurrences - since it's not detached
            expect(writingCount).to.equal(0);
            const deletingRegEx = new RegExp('deleting tmp directory', 'g');
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            const deletingCount = (alignedOuput.match(deletingRegEx) || []).length;
            expect(deletingCount).to.equal(0);
            const babelRcWriteMessage = abstractVinylVerboseMsg(path.join(tmpFolder, '.babelrc'), true);
            const mochaOptsWriteMessage = abstractVinylVerboseMsg(path.join(tmpFolder, 'mocha-config.opts'), true);
            expect(alignedOuput).to.not.have.string(babelRcWriteMessage);
            expect(alignedOuput).to.not.have.string(mochaOptsWriteMessage);
          });
          it('should show results when there is exception on a test file', () => {
            helper.fs.createFile('', 'exception.spec.js', fixtures.exceptionTest);
            let output;
            try {
              helper.command.addComponent('exception.spec.js', { i: 'comp/my-comp', t: 'exception.spec.js' });
              helper.command.testComponent('comp/my-comp');
            } catch (e) {
              output = e.message;
            }
            expect(output).to.have.string('bit failed to test');
            expect(output).to.have.string('comp/my-comp@0.0.1 with the following exception:');
            expect(output).to.have.string('exception during test file');
          });
        });
        describe('with fork level - NONE', () => {
          before(() => {
            helper.scopeHelper.getClonedLocalScope(authorScopeBeforeChanges);
            helper.fs.createFile('', 'fail.spec.js', fixtures.failTest);
            helper.command.addComponent('fail.spec.js', { i: 'comp/my-comp', t: 'fail.spec.js' });
          });
          it('should show results with failing tests', () => {
            let output;
            let statusCode;
            try {
              helper.command.testComponentWithOptions('comp/my-comp', { '-fork-level': 'NONE' });
            } catch (err) {
              output = err.stdout.toString();
              statusCode = err.status;
            }
            expect(statusCode).to.not.equal(0);
            expect(output).to.have.string('tests failed');
            expect(output).to.have.string('✔ group of passed tests');
            expect(output).to.have.string('✖ group of failed tests');
          });
          it('should show results when there is exception on a test file', () => {
            helper.fs.createFile('', 'exception.spec.js', fixtures.exceptionTest);
            let output;
            try {
              helper.command.addComponent('exception.spec.js', { i: 'comp/my-comp', t: 'exception.spec.js' });
              helper.command.testComponentWithOptions('comp/my-comp', { '-fork-level': 'NONE' });
            } catch (e) {
              output = e.message;
            }
            expect(output).to.have.string('bit failed to test');
            expect(output).to.have.string('comp/my-comp@0.0.1 with the following exception:');
            expect(output).to.have.string('exception during test file');
          });
        });
        describe('with fork level - ONE', () => {
          before(() => {
            helper.scopeHelper.getClonedLocalScope(authorScopeBeforeChanges);
            helper.fs.createFile('', 'fail.spec.js', fixtures.failTest);
            helper.command.addComponent('fail.spec.js', { i: 'comp/my-comp', t: 'fail.spec.js' });
          });
          it('should show results with failing tests', () => {
            let output;
            let statusCode;
            try {
              helper.command.testComponentWithOptions('comp/my-comp', { '-fork-level': 'ONE' });
            } catch (err) {
              output = err.stdout.toString();
              statusCode = err.status;
            }
            expect(statusCode).to.not.equal(0);
            expect(output).to.have.string('tests failed');
            expect(output).to.have.string('✔ group of passed tests');
            expect(output).to.have.string('✖ group of failed tests');
          });
          it('should show results when there is exception on a test file', () => {
            helper.fs.createFile('', 'exception.spec.js', fixtures.exceptionTest);
            let output;
            try {
              helper.command.addComponent('exception.spec.js', { i: 'comp/my-comp', t: 'exception.spec.js' });
              helper.command.testComponentWithOptions('comp/my-comp', { '-fork-level': 'ONE' });
            } catch (e) {
              output = e.message;
            }
            expect(output).to.have.string('bit failed to test');
            expect(output).to.have.string('comp/my-comp@0.0.1 with the following exception:');
            expect(output).to.have.string('exception during test file');
          });
        });
        describe('with fork level - COMPONENT', () => {
          before(() => {
            helper.scopeHelper.getClonedLocalScope(authorScopeBeforeChanges);
            helper.fs.createFile('', 'fail.spec.js', fixtures.failTest);
            helper.command.addComponent('fail.spec.js', { i: 'comp/my-comp', t: 'fail.spec.js' });
          });
          it('should show results with failing tests', () => {
            let output;
            let statusCode;
            try {
              helper.command.testComponentWithOptions('comp/my-comp', { '-fork-level': 'COMPONENT' });
            } catch (err) {
              output = err.stdout.toString();
              statusCode = err.status;
            }
            expect(statusCode).to.not.equal(0);
            expect(output).to.have.string('tests failed');
            expect(output).to.have.string('✔ group of passed tests');
            expect(output).to.have.string('✖ group of failed tests');
          });
          it('should show results when there is exception on a test file', () => {
            helper.fs.createFile('', 'exception.spec.js', fixtures.exceptionTest);
            let output;
            try {
              helper.command.addComponent('exception.spec.js', { i: 'comp/my-comp', t: 'exception.spec.js' });
              helper.command.testComponentWithOptions('comp/my-comp', { '-fork-level': 'COMPONENT' });
            } catch (e) {
              output = e.message;
            }
            expect(output).to.have.string('bit failed to test');
            expect(output).to.have.string('comp/my-comp@0.0.1 with the following exception:');
            expect(output).to.have.string('exception during test file');
          });
        });
      });
    });
    describe('changing envs config', () => {
      beforeEach(() => {
        // Restore to clean state of the scope
        helper.scopeHelper.getClonedLocalScope(authorScopeBeforeChanges);
        // Make sure the component is not modified before the changes
        helper.command.expectStatusToBeClean();
      });
      describe('changing envs raw config', () => {
        it('should show the component as modified after changing compiler raw config', () => {
          helper.bitJson.addToRawConfigOfEnv(undefined, 'a', 'c', COMPILER_ENV_TYPE);
          const statusOutput = helper.command.status();
          expect(statusOutput).to.have.string('modified components');
          expect(statusOutput).to.have.string('comp/my-comp ... ok');
        });
        it('should show the component as modified after changing tester raw config', () => {
          helper.bitJson.addToRawConfigOfEnv(undefined, 'a', 'c', TESTER_ENV_TYPE);
          const statusOutput = helper.command.status();
          expect(statusOutput).to.have.string('modified components');
          expect(statusOutput).to.have.string('comp/my-comp ... ok');
        });
        it('bit-diff should show compiler config differences', () => {
          helper.bitJson.addToRawConfigOfEnv(undefined, 'a', 'c', COMPILER_ENV_TYPE);
          const diff = helper.command.diff('comp/my-comp');
          expect(diff).to.have.string('--- Compiler configuration (0.0.1 original)');
          expect(diff).to.have.string('+++ Compiler configuration (0.0.1 modified)');
          expect(diff).to.have.string('- "a": "b",');
          expect(diff).to.have.string('+ "a": "c",');
        });
        it('bit-diff should show tester config differences', () => {
          helper.bitJson.addToRawConfigOfEnv(undefined, 'a', 'c', TESTER_ENV_TYPE);
          const diff = helper.command.diff('comp/my-comp');
          expect(diff).to.have.string('--- Tester configuration (0.0.1 original)');
          expect(diff).to.have.string('+++ Tester configuration (0.0.1 modified)');
          expect(diff).to.have.string('- "a": "b",');
          expect(diff).to.have.string('+ "a": "c",');
        });
        it('should show error if the raw config is not valid', () => {
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          helper.bitJson.addToRawConfigOfEnv(undefined, 'bablercPath', 5, COMPILER_ENV_TYPE);
          const fullCompilerId = `${helper.scopes.env}/${compilerId}@0.0.1`;
          const schemaRawError = 'data.bablercPath should be string';
          const schemaError = new ExtensionSchemaError(fullCompilerId, schemaRawError);
          const loadError = new ExtensionLoadError(schemaError, fullCompilerId, false);
          const statusFunc = () => helper.command.status();
          helper.general.expectToThrow(statusFunc, loadError);
        });
      });
    });
  });
  describe('imported environment', () => {
    const componentFolder = path.join('components', 'comp', 'my-comp');
    let importedScopeBeforeChanges;

    describe('without ejecting (--conf)', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.scopeHelper.addRemoteEnvironment();
        helper.command.importComponent('comp/my-comp');
        importedScopeBeforeChanges = helper.scopeHelper.cloneLocalScope();
      });
      it('should not show the component as modified after import', () => {
        // Make sure the component is not modified before the changes
        helper.command.expectStatusToBeClean();
      });
      it("should add the envPackageDependencies to devDependencies in component's package.json", () => {
        const packageJson = helper.packageJson.readComponentPackageJson('comp/my-comp');
        const devDeps = packageJson.devDependencies;
        expect(devDeps).to.include({
          'babel-plugin-transform-object-rest-spread': '^6.26.0',
          'babel-preset-env': '^1.6.1',
          'lodash.get': '4.4.2',
        });
      });
      it('should build the component successfully', () => {
        // Changing the component to make sure we really run a rebuild and not taking the dist from the models
        helper.fs.createFile(componentFolder, 'objRestSpread.js', fixtures.objectRestSpreadWithChange);
        const output = helper.command.buildComponentWithOptions('comp/my-comp', { v: '', '-no-cache': '' });
        const alignedOuput = GeneralHelper.alignOutput(output);
        expect(output).to.have.string(path.join('dist', 'objRestSpread.js.map'));
        expect(output).to.have.string(path.join('dist', 'objRestSpread.js'));
        const tmpFolder = path.join(helper.scopes.localPath, componentFolder, BIT_WORKSPACE_TMP_DIRNAME);
        expect(alignedOuput).to.have.string(`writing config files to ${tmpFolder}`);
        const babelRcWriteMessage = abstractVinylVerboseMsg(path.join(tmpFolder, '.babelrc'), true);
        expect(alignedOuput).to.have.string(babelRcWriteMessage);
        expect(alignedOuput).to.have.string(`deleting tmp directory ${tmpFolder}`);
        const distFilePath = path.join(
          helper.scopes.localPath,
          'components',
          'comp',
          'my-comp',
          'dist',
          'objRestSpread.js'
        );
        const distContent = fs.readFileSync(distFilePath).toString();
        expect(distContent).to.have.string(
          'var _extends=Object.assign||function(target){for(var i=1;i<arguments.length;i++){var source=arguments[i];for(var key in source){if(Object.prototype.hasOwnProperty.call(source,key)){target[key]=source[key]}}}return target};var g=5;var x={a:"a",b:"c"};var y={c:"c"};var z=_extends({},x,y);'
        );
      });
      describe('testing components', () => {
        describe('with success tests', () => {
          let output;
          let alignedOuput;
          before(() => {
            output = helper.command.testComponentWithOptions('comp/my-comp', { v: '' });
            alignedOuput = GeneralHelper.alignOutput(output);
          });
          it('should show tests passed', () => {
            expect(output).to.have.string('tests passed');
            expect(output).to.have.string('total duration');
            expect(output).to.have.string('✔ group of passed tests');
          });
          // This was skipped as part of the binary branch since we move the bit test to run inside bit
          // and we expect a valid json to return from the command.
          // See worker.js and search for "const VERBOSE = false" for more information
          it.skip('should write config files to tmp directory', () => {
            const tmpFolder = path.join(helper.scopes.localPath, componentFolder, BIT_WORKSPACE_TMP_DIRNAME);
            const writingStr = `writing config files to ${tmpFolder}`;
            // Since the output comes from console.log it's with \n also in windows
            const splittedAlignedOutput = alignedOuput.split('\n');
            // don't use regex because of windows problems
            const writingCount = splittedAlignedOutput.filter((line) => line === writingStr).length;
            // There should be 2 occurrences - one for the compiler and one for the tester
            expect(writingCount).to.equal(2);
            const deletingStr = `deleting tmp directory ${tmpFolder}`;
            const deletingCount = splittedAlignedOutput.filter((line) => line === deletingStr).length;
            expect(deletingCount).to.equal(2);
            const babelRcWriteMessage = abstractVinylVerboseMsg(path.join(tmpFolder, '.babelrc'), true);
            const mochaOptsWriteMessage = abstractVinylVerboseMsg(path.join(tmpFolder, 'mocha-config.opts'), true);
            expect(alignedOuput).to.have.string(babelRcWriteMessage);
            expect(alignedOuput).to.have.string(mochaOptsWriteMessage);
          });
        });
        describe('with failing tests', () => {
          before(() => {
            helper.fs.createFile(componentFolder, 'fail.spec.js', fixtures.failTest);
            const failSpecPath = path.join(componentFolder, 'fail.spec.js');
            helper.command.addComponent(failSpecPath, { i: 'comp/my-comp', t: failSpecPath });
          });
          describe('with default fork level', () => {
            it('should show results without define fork level', () => {
              let output;
              let statusCode;
              try {
                helper.command.testComponent('comp/my-comp');
              } catch (err) {
                output = err.stdout.toString();
                statusCode = err.status;
              }
              expect(statusCode).to.not.equal(0);
              expect(output).to.have.string('tests failed');
              expect(output).to.have.string('✔ group of passed tests');
              expect(output).to.have.string('✖ group of failed tests');
            });
            it('should show results when there is exception on a test file', () => {
              helper.fs.createFile(componentFolder, 'exception.spec.js', fixtures.exceptionTest);
              const exceptionSpecPath = path.join(componentFolder, 'exception.spec.js');

              let output;
              try {
                helper.command.addComponent(exceptionSpecPath, { i: 'comp/my-comp', t: exceptionSpecPath });
                helper.command.testComponent('comp/my-comp');
              } catch (e) {
                output = e.message;
              }
              expect(output).to.have.string('bit failed to test');
              expect(output).to.have.string('comp/my-comp@0.0.1 with the following exception:');
              expect(output).to.have.string('exception during test file');
            });
          });
        });
      });
      describe('eject conf', () => {
        let fullComponentFolder;
        let bitJsonPath;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(importedScopeBeforeChanges);
          fullComponentFolder = path.join(helper.scopes.localPath, componentFolder);
        });
        describe('negative tests', () => {
          it('should show error if the component id does not exist', () => {
            const error = new MissingBitMapComponent('fake/comp');
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            const ejectFunc = () => helper.command.ejectConf('fake/comp');
            helper.general.expectToThrow(ejectFunc, error);
          });
        });
        describe('without path provided', () => {
          before(() => {
            helper.scopeHelper.getClonedLocalScope(importedScopeBeforeChanges);
            bitJsonPath = path.join(fullComponentFolder, 'bit.json');
            helper.command.ejectConf('comp/my-comp');
          });
          it('should write the bit.json to the component folder', () => {
            expect(bitJsonPath).to.be.a.file();
          });
        });
      });
      describe('inject conf', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(importedScopeBeforeChanges);
        });
        describe('negative tests', () => {
          it('should show error if the component id does not exist', () => {
            const error = new MissingBitMapComponent('fake/comp');
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            const injectFunc = () => helper.command.injectConf('fake/comp');
            helper.general.expectToThrow(injectFunc, error);
          });
          // @todo: this has been skipped temporarily since the change of overriding envs via package.json, see PR #1576
          it.skip('should show error if the component was not ejected before', () => {
            const error = new InjectNonEjected();
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            const injectFunc = () => helper.command.injectConf('comp/my-comp');
            helper.general.expectToThrow(injectFunc, error);
          });
        });
      });
    });

    // Skipped since --conf is disabled for legacy projects
    describe.skip('with ejecting (--conf)', () => {
      let fullComponentFolder;
      let bitJsonPath;

      describe('with default ejectedEnvsDirectory', () => {
        before(() => {
          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
          helper.scopeHelper.addRemoteEnvironment();
          helper.command.importComponentWithOptions('comp/my-comp', { '-conf': '' });
          importedScopeBeforeChanges = helper.scopeHelper.cloneLocalScope();
          fullComponentFolder = path.join(helper.scopes.localPath, componentFolder);
          bitJsonPath = path.join(fullComponentFolder, 'bit.json');
        });
        it('should store the files under DEFAULT_EJECTED_ENVS_DIR_PATH', () => {
          expect(bitJsonPath).to.be.file();
        });
        it('should build the component successfully', () => {
          // Changing the component to make sure we really run a rebuild and not taking the dist from the models
          helper.fs.createFile(componentFolder, 'objRestSpread.js', fixtures.objectRestSpreadWithChange);
          const output = helper.command.build('comp/my-comp');
          expect(output).to.have.string(path.join('dist', 'objRestSpread.js.map'));
          expect(output).to.have.string(path.join('dist', 'objRestSpread.js'));
          const distFilePath = path.join(
            helper.scopes.localPath,
            'components',
            'comp',
            'my-comp',
            'dist',
            'objRestSpread.js'
          );
          const distContent = fs.readFileSync(distFilePath).toString();
          expect(distContent).to.have.string(
            'var _extends=Object.assign||function(target){for(var i=1;i<arguments.length;i++){var source=arguments[i];for(var key in source){if(Object.prototype.hasOwnProperty.call(source,key)){target[key]=source[key]}}}return target};var g=5;var x={a:"a",b:"c"};var y={c:"c"};var z=_extends({},x,y);'
          );
        });
        describe('testing components', () => {
          describe('with success tests', () => {
            it('should show tests passed', () => {
              const output = helper.command.testComponent('comp/my-comp');
              expect(output).to.have.string('tests passed');
              expect(output).to.have.string('total duration');
              expect(output).to.have.string('✔ group of passed tests');
            });
          });
          describe('with failing tests', () => {
            before(() => {
              helper.scopeHelper.getClonedLocalScope(importedScopeBeforeChanges);
              helper.fs.createFile(componentFolder, 'fail.spec.js', fixtures.failTest);
              const failSpecPath = path.join(componentFolder, 'fail.spec.js');
              helper.command.addComponent(failSpecPath, { i: 'comp/my-comp', t: failSpecPath });
            });
            describe('with default fork level', () => {
              it('should show results without define fork level', () => {
                let output;
                let statusCode;
                try {
                  helper.command.testComponent('comp/my-comp');
                } catch (err) {
                  output = err.stdout.toString();
                  statusCode = err.status;
                }
                expect(statusCode).to.not.equal(0);
                expect(output).to.have.string('tests failed');
                expect(output).to.have.string('✔ group of passed tests');
                expect(output).to.have.string('✖ group of failed tests');
              });
              it('should show results when there is exception on a test file', () => {
                helper.fs.createFile(componentFolder, 'exception.spec.js', fixtures.exceptionTest);
                const exceptionSpecPath = path.join(componentFolder, 'exception.spec.js');
                helper.command.addComponent(exceptionSpecPath, { i: 'comp/my-comp', t: exceptionSpecPath });
                let output;
                try {
                  helper.command.testComponent('comp/my-comp');
                } catch (e) {
                  output = e.message;
                }
                expect(output).to.have.string('bit failed to test');
                expect(output).to.have.string('comp/my-comp@0.0.1 with the following exception:');
                expect(output).to.have.string('exception during test file');
              });
            });
          });
        });
        describe('dynamic config as raw config', () => {
          let bitJson;
          before(() => {
            helper.scopeHelper.getClonedLocalScope(importedScopeBeforeChanges);
            bitJson = helper.bitJson.read(fullComponentFolder);
          });
          it('should write the compiler dynamic config as raw config', () => {
            const env = helper.bitJson.getEnvByType(bitJson, COMPILER_ENV_TYPE);
            expect(env.rawConfig).to.include(envConfigOriginal);
          });
          it('should write the tester dynamic config as raw config', () => {
            const env = helper.bitJson.getEnvByType(bitJson, TESTER_ENV_TYPE);
            expect(env.rawConfig).to.include(envConfigOriginal);
          });
        });
        describe('attach - detach envs', () => {
          let compId;
          let componentModel;
          before(() => {
            compId = `${helper.scopes.remote}/comp/my-comp@0.0.2`;
            helper.scopeHelper.getClonedLocalScope(importedScopeBeforeChanges);
          });
          describe('changing envs of imported component', () => {
            before(() => {
              helper.bitJson.addToRawConfigOfEnv(fullComponentFolder, 'a', 'compiler', COMPILER_ENV_TYPE);
              helper.bitJson.addToRawConfigOfEnv(fullComponentFolder, 'a', 'tester', TESTER_ENV_TYPE);
              helper.command.tagAllComponents();
              componentModel = helper.command.catComponent(compId);
            });
            it('should save the new config into the model', () => {
              expect(componentModel.compiler.config).to.include(compilerConfigChanged);
              expect(componentModel.tester.config).to.include(testerConfigChanged);
            });
            it('should not show the component as modified', () => {
              const statusOutput = helper.command.status();
              expect(statusOutput).to.not.have.string('modified components');
            });
          });
          // this functionality won't work anymore. we might add it later by an extension
          // describe.skip('attach imported component', () => {
          //   let output;
          //   let compilerModel;
          //   let testerModel;
          //   before(() => {
          //     helper.scopeHelper.getClonedLocalScope(importedScopeBeforeChanges);
          //     output = helper.envsAttach(['comp/my-comp'], { c: '', t: '' });
          //     const mockEnvs = {
          //       compiler: {
          //         [`${helper.scopes.envScope}/compilers/new-babel@0.0.1`]: {
          //           rawConfig: {
          //             a: 'my-compiler',
          //             valToDynamic: 'dyanamicValue'
          //           }
          //         }
          //       },
          //       tester: {
          //         [`${helper.scopes.envScope}/testers/new-mocha@0.0.1`]: {
          //           rawConfig: {
          //             a: 'my-tester',
          //             valToDynamic: 'dyanamicValue'
          //           }
          //         }
          //       }
          //     };
          //     helper.bitJson.addKeyValToBitJson(undefined, 'env', mockEnvs);
          //     componentModel = helper.command.showComponentParsed('comp/my-comp');
          //     compilerModel = componentModel.compiler;
          //     testerModel = componentModel.tester;
          //     compId = `${helper.scopes.remoteScope}/comp/my-comp@0.0.1`;
          //     const bitmap = helper.bitMap.readBitMap();
          //     componentMap = bitmap[compId];
          //   });
          //   it('should print to output the attached components', () => {
          //     expect(output).to.have.string('the following components has been attached to the workspace environments');
          //     expect(output).to.have.string('comp/my-comp');
          //   });
          //   it('should show error if trying to eject config if the component is bound to the workspace config', () => {
          //     const error = new EjectBoundToWorkspace();
          //     const ejectFunc = () => helper.command.ejectConf('comp/my-comp');
          //     helper.general.expectToThrow(ejectFunc, error);
          //   });
          //   it('should load the compiler from workspace bit.json after attach compiler back', () => {
          //     expect(compilerModel.config).to.include({
          //       a: 'my-compiler',
          //       valToDynamic: 'dyanamicValue'
          //     });
          //   });
          //   it('should load the tester from workspace bit.json after attach tester back', () => {
          //     expect(testerModel.config).to.include({
          //       a: 'my-tester',
          //       valToDynamic: 'dyanamicValue'
          //     });
          //   });
          //   it('should mark the compiler as not detached in .bitmap if the compiler is attached', () => {
          //     expect(componentMap.detachedCompiler).to.be.false;
          //   });
          //   it('should mark the tester as not detached in .bitmap if the tester is attached', () => {
          //     expect(componentMap.detachedTester).to.be.false;
          //   });
          //   describe('tagging attached imported component', () => {
          //     before(() => {
          //       helper.fs.createFile(componentFolder, 'objRestSpread.js', 'const g = 5;');
          //       helper.scopeHelper.addRemoteEnvironment();
          //       helper.command.tagAllComponents();
          //       compId = `${helper.scopes.remoteScope}/comp/my-comp@0.0.2`;
          //       componentModel = helper.command.catComponent(compId);
          //     });
          //     it('should mark the compiler as detached in the models since it was changed', () => {
          //       expect(componentModel.detachedCompiler).to.be.true;
          //     });
          //     it('should mark the tester as detached in the models since it was changed', () => {
          //       expect(componentModel.detachedTester).to.be.true;
          //     });
          //   });
          // });
        });
        describe('change envs config', () => {
          beforeEach(() => {
            // Restore to clean state of the scope
            helper.scopeHelper.getClonedLocalScope(importedScopeBeforeChanges);
          });
          it('should show the component as modified if compiler config has been changed', () => {
            helper.bitJson.addToRawConfigOfEnv(fullComponentFolder, 'a', 'compiler', COMPILER_ENV_TYPE);
            const statusOutput = helper.command.status();
            expect(statusOutput).to.have.string('modified components');
            expect(statusOutput).to.have.string('comp/my-comp ... ok');

            const diffOutput = helper.command.diff('comp/my-comp');
            expect(diffOutput).to.have.string('- "a": "b"');
            expect(diffOutput).to.have.string('+ "a": "compiler"');
          });
          it('should show the component as modified if tester config has been changed', () => {
            helper.bitJson.addToRawConfigOfEnv(fullComponentFolder, 'a', 'tester', TESTER_ENV_TYPE);
            const statusOutput = helper.command.status();
            expect(statusOutput).to.have.string('modified components');
            expect(statusOutput).to.have.string('comp/my-comp ... ok');
          });
        });
      });
    });
  });
  describe('overrides dynamic packages dependencies', () => {
    before(() => {
      helper.scopeHelper.getClonedLocalScope(authorScopeBeforeExport);
      helper.bitJson.addOverrides({
        '*': {
          devDependencies: {
            'babel-preset-env': '-',
          },
        },
      });
    });
    it('overrides feature should consider the packages received from the compiler', () => {
      const comp = helper.command.showComponentParsed('comp/my-comp');
      expect(comp.devPackageDependencies).to.not.have.property('babel-preset-env');
      expect(comp.compilerPackageDependencies.devDependencies).to.not.have.property('babel-preset-env');
      expect(comp.manuallyRemovedDependencies.devDependencies).to.include('babel-preset-env');
    });
  });
  describe('overrides dynamic component dependencies', () => {
    before(() => {
      helper.scopeHelper.getClonedLocalScope(authorScopeBeforeExport);
      const compilerPath = `.bit/components/compilers/new-babel/${helper.scopes.env}/0.0.1/compiler.js`;
      const compilerFile = helper.fs.readFile(compilerPath);
      helper.fs.outputFile(
        compilerPath,
        compilerFile.replace(
          'return { devDependencies: dynamicPackageDependencies };',
          "return { devDependencies: dynamicPackageDependencies, dependencies: {'@bit/comp/my-comp2': '2.0.0'} };"
        )
      );
      helper.bitJson.addOverrides({
        '*': {
          dependencies: {
            '@bit/comp/my-comp2': '-',
          },
        },
      });
    });
    it('overrides feature should consider the packages received from the compiler', () => {
      const comp = helper.command.showComponentParsed('comp/my-comp');
      expect(comp.dependencies).to.have.lengthOf(0);
      expect(comp.compilerPackageDependencies.dependencies).to.not.have.property('@bit/comp/my-comp2');
      expect(comp.manuallyRemovedDependencies.dependencies).to.include('comp/my-comp2');
    });
  });
});

describe('add an env with an invalid env name', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  let numOfObjectsBeforeTagging;
  before(() => {
    helper.scopeHelper.reInitLocalScope();
    helper.env.importDummyCompiler();
    const bitJson = helper.bitJson.read();
    bitJson.env = {
      compiler: {
        dummy: {
          // an invalid name. doesn't have a scope name.
          options: {
            file: path.join(
              helper.scopes.localPath,
              `.bit/components/compilers/dummy/${helper.scopes.env}/0.0.1/compiler.js`
            ),
          },
        },
      },
    };
    helper.bitJson.write(bitJson);
    const objectFiles = helper.fs.getObjectFiles();
    numOfObjectsBeforeTagging = objectFiles.length;
    helper.fixtures.createComponentBarFoo();
    helper.fixtures.addComponentBarFoo();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('tagging the component', () => {
    let output;
    before(() => {
      output = helper.general.runWithTryCatch('bit tag -a');
    });
    it('should throw an error saying BitId is invalid', () => {
      expect(output).to.have.string('the env.name has an invalid Bit id');
    });
    it('should not save anything into the objects dir', () => {
      // see https://github.com/teambit/bit/issues/1727 for a previous bug about it
      const numOfObjectsAfterTagging = helper.fs.getObjectFiles().length;
      expect(numOfObjectsAfterTagging).to.equal(numOfObjectsBeforeTagging);
    });
  });
});
