import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import Helper from '../e2e-helper';
import * as fixtures from '../fixtures/fixtures';
import { DEFAULT_EJECTED_DIR_ENVS } from '../../src/constants';
import { eol } from '../../src/utils';

// TODO: backward compatibility
// should support declare env in old format (string)
// should not show component in modified if the compiler defined in old format (string)
// should not show components as modified for consumer bit.json in old format
// should not show components as modified for component with old model format

// TODO: Tests
// should skip the test running if --skip-test flag provided during tag (move to tag.e2e)
// test with dynamicPackageDependencies should work (make sure the dynamicPackageDependencies are resolved correctly)

describe('envs', function () {
  this.timeout(0);
  const helper = new Helper();
  describe('without dependencies', () => {
    const compilerId = 'compilers/new-babel';
    const testerId = 'testers/new-mocha';
    let authorScopeBeforeChanges;
    let remoteScopeBeforeChanges;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const compiler = path.join('compilers', 'new-babel', 'compiler.js');
      helper.copyFixtureFile(compiler);
      helper.addComponentWithOptions('compiler.js', {
        i: compilerId
      });
      const tester = path.join('testers', 'new-mocha', 'tester.js');
      helper.copyFixtureFile(tester);
      helper.addComponentWithOptions('tester.js', {
        i: testerId
      });
      helper.reInitEnvsScope();
      helper.addRemoteEnvironment();
      helper.addNpmPackage('babel-core', '6.26.3');
      helper.addNpmPackage('fs-extra', '5.0.0');
      helper.addNpmPackage('mocha', '5.1.1');
      helper.addNpmPackage('vinyl', '2.1.0');
      helper.addNpmPackage('resolve', '1.7.1');
      helper.tagAllWithoutMessage();
      helper.exportAllComponents(helper.envScope);
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.initNpm();
      helper.addRemoteEnvironment();
      helper.importCompiler(`${helper.envScope}/${compilerId}`);
      helper.importTester(`${helper.envScope}/${testerId}`);
      const babelrcFixture = path.join('compilers', 'new-babel', '.babelrc');
      helper.copyFixtureFile(babelrcFixture);
      helper.addFileToEnvInBitJson(undefined, '.babelrc', './.babelrc', 'compiler');
      helper.addToRawConfigOfEnvInBitJson(undefined, 'a', 'b', 'compiler');
      helper.addToRawConfigOfEnvInBitJson(undefined, 'valToDynamic', 'valToDynamic', 'compiler');
      helper.createFile('', 'mocha-config.js', '{"someConfKey": "someConfVal"}');
      helper.addFileToEnvInBitJson(undefined, 'config', './mocha-config.js', 'tester');
      helper.addToRawConfigOfEnvInBitJson(undefined, 'a', 'b', 'tester');
      helper.addToRawConfigOfEnvInBitJson(undefined, 'valToDynamic', 'valToDynamic', 'tester');
      helper.createFile('', 'objRestSpread.js', fixtures.objectRestSpread);
      helper.createFile('', 'pass.spec.js', fixtures.passTest);
      helper.addComponentWithOptions('objRestSpread.js', {
        i: 'comp/my-comp',
        t: '"*.spec.js"',
        m: 'objRestSpread.js'
      });
      helper.installNpmPackage('babel-plugin-transform-object-rest-spread', '6.26.0');
      helper.installNpmPackage('babel-preset-env', '1.6.1');
      helper.installNpmPackage('chai', '4.1.2');
      helper.tagAllWithoutMessage();
      helper.exportAllComponents();
      authorScopeBeforeChanges = helper.cloneLocalScope();
      remoteScopeBeforeChanges = helper.cloneRemoteScope();
    });

    after(() => {
      helper.destroyEnv();
    });

    describe('author environment', () => {
      // TODO: reimport component on author after changing file/config of its env in different project
      // (should load env from model)
      // TODO: reimport component on author after changing the component code in different project
      // And change the env config in the root bit.json (should load from root bit.json)

      let componentModel;
      let compilerModel;
      let testerModel;
      let envsPackageDependencies;
      before(() => {
        componentModel = helper.catComponent('comp/my-comp@0.0.1');
        compilerModel = componentModel.compiler;
        testerModel = componentModel.tester;
        envsPackageDependencies = componentModel.envsPackageDependencies;
      });
      describe('storing envs metadata in the models for author', () => {
        it('should store the compiler name in the model', () => {
          expect(compilerModel.name).to.equal(`${helper.envScope}/${compilerId}@0.0.1`);
        });
        it('should store the tester name in the model', () => {
          expect(testerModel.name).to.equal(`${helper.envScope}/${testerId}@0.0.1`);
        });
        it('should store the compiler dynamic config in the model', () => {
          expect(compilerModel.config).to.include({
            a: 'b',
            valToDynamic: 'dyanamicValue'
          });
        });
        it('should store the tester dynamic config in the model', () => {
          expect(testerModel.config).to.include({
            a: 'b',
            valToDynamic: 'dyanamicValue'
          });
        });
        it('should store the compiler files metadata in the model', () => {
          expect(compilerModel.files).to.have.lengthOf(1);
          expect(compilerModel.files[0]).to.include({ name: '.babelrc' });
          expect(compilerModel.files[0])
            .to.have.property('file')
            .that.is.a('string');
        });
        it('should store the tester files metadata in the model', () => {
          expect(testerModel.files).to.have.lengthOf(1);
          expect(testerModel.files[0]).to.include({ name: 'config' });
          expect(testerModel.files[0])
            .to.have.property('file')
            .that.is.a('string');
        });
        it('should store the compiler files in the model', () => {
          const babelRcObjectHash = compilerModel.files[0].file;
          const babelRcFromModel = helper.catObject(babelRcObjectHash).trim();
          const babelRcPath = path.join(helper.localScopePath, '.babelrc');
          const babelRcFromFS = eol.lf(fs.readFileSync(babelRcPath).toString(), babelRcPath);
          expect(babelRcFromModel).to.equal(babelRcFromFS);
        });
        it('should store the tester files in the model', () => {
          const mochaConfigHash = testerModel.files[0].file;
          const mochaConfigFromModel = helper.catObject(mochaConfigHash).trim();
          const mochaConfigPath = path.join(helper.localScopePath, 'mocha-config.js');
          const mochaConfigFromFS = fs.readFileSync(mochaConfigPath).toString();
          expect(mochaConfigFromModel).to.equal(mochaConfigFromFS);
        });
        describe('should store the dynamicPackageDependencies to envPackageDependencies in the model', () => {
          it('should store the compiler dynamicPackageDependencies', () => {
            expect(envsPackageDependencies).to.include({
              'babel-plugin-transform-object-rest-spread': '^6.26.0',
              'babel-preset-env': '^1.6.1'
            });
          });
          it('should store the tester dynamicPackageDependencies', () => {
            expect(envsPackageDependencies).to.include({
              'lodash.get': '4.4.2'
            });
          });
        });
      });
      it('should show the envPackageDependencies when running bit show', () => {
        const output = helper.showComponent('comp/my-comp');
        expect(output).to.have.string('babel-plugin-transform-object-rest-spread@^6.26.0');
        expect(output).to.have.string('babel-preset-env@^1.6.1');
        expect(output).to.have.string('lodash.get@4.4.2');
      });
      it('should build the component successfully', () => {
        const output = helper.build('comp/my-comp');
        expect(output).to.have.string(path.join('dist', 'objRestSpread.js.map'));
        expect(output).to.have.string(path.join('dist', 'objRestSpread.js'));
        // const distFilePath = path.join(helper.localScopePath, 'components', 'comp', 'my-comp', 'dist', 'objRestSpread.js');
        const distFilePath = path.join(helper.localScopePath, 'dist', 'objRestSpread.js');
        const distContent = fs.readFileSync(distFilePath).toString();
        expect(distContent).to.have.string(
          'var _extends=Object.assign||function(target){for(var i=1;i<arguments.length;i++){var source=arguments[i];for(var key in source){if(Object.prototype.hasOwnProperty.call(source,key)){target[key]=source[key]}}}return target};var g=5;var x={a:"a",b:"b"};var y={c:"c"};var z=_extends({},x,y);'
        );
      });
      describe('attach - detach envs', () => {
        let fullComponentFolder;
        let bitJsonPath;
        let componentMap;
        let compId;

        before(() => {
          // Change the component envs in imported environment to make sure they are detached
          helper.reInitLocalScope();
          helper.addRemoteScope();
          helper.addRemoteEnvironment();
          helper.importComponentWithOptions('comp/my-comp', { '-conf': '' });
          fullComponentFolder = path.join(helper.localScopePath, 'components', 'comp', 'my-comp');
          bitJsonPath = path.join(fullComponentFolder, 'bit.json');
          helper.addToRawConfigOfEnvInBitJson(bitJsonPath, 'a', 'compiler', 'compiler');
          helper.addToRawConfigOfEnvInBitJson(bitJsonPath, 'a', 'tester', 'tester');
          helper.tagAllWithoutMessage();
          helper.exportAllComponents();
          helper.getClonedLocalScope(authorScopeBeforeChanges);
          helper.importComponent('comp/my-comp');
          const bitmap = helper.readBitMap();
          compId = `${helper.remoteScope}/comp/my-comp@0.0.2`;
          componentMap = bitmap[compId];
          componentModel = helper.showComponentParsed('comp/my-comp');
          compilerModel = componentModel.compiler;
          testerModel = componentModel.tester;
        });
        it('should mark the compiler as detached in .bitmap if the compiler is detached', () => {
          expect(componentMap.detachedCompiler).to.be.true;
        });
        it('should mark the tester as detached in .bitmap if the tester is detached', () => {
          expect(componentMap.detachedTester).to.be.true;
        });
        it('should load the compiler from models if the compiler is detached', () => {
          expect(compilerModel.config).to.include({
            a: 'compiler',
            valToDynamic: 'dyanamicValue'
          });
        });
        it('should load the tester from models if the compiler is detached', () => {
          expect(testerModel.config).to.include({
            a: 'tester',
            valToDynamic: 'dyanamicValue'
          });
        });
        describe('tagging detached component', () => {
          before(() => {
            // Change the component
            helper.createFile('', 'objRestSpread.js', 'const a = 3');
            helper.tagAllWithoutMessage();
            compId = `${helper.remoteScope}/comp/my-comp@0.0.3`;
            componentModel = helper.catComponent(compId);
          });
          it('should mark the compiler as detached in models when tagging again', () => {
            expect(componentModel.detachedCompiler).to.be.true;
          });
          it('should mark the tester as detached in models when tagging again', () => {
            expect(componentModel.detachedTester).to.be.true;
          });
        });
        describe('attach back', () => {
          let output;
          before(() => {
            output = helper.envsAttach(['comp/my-comp'], { c: '', t: '' });
            componentModel = helper.showComponentParsed('comp/my-comp');
            compilerModel = componentModel.compiler;
            testerModel = componentModel.tester;
          });
          it('should print to output the attached components', () => {
            expect(output).to.have.string('the following components has been attached to the workspace environments');
            expect(output).to.have.string('comp/my-comp');
          });
          it('should load the compiler from workspace bit.json after attach compiler back', () => {
            expect(compilerModel.config).to.include({
              a: 'b',
              valToDynamic: 'dyanamicValue'
            });
          });
          it('should load the tester from workspace bit.json after attach tester back', () => {
            expect(testerModel.config).to.include({
              a: 'b',
              valToDynamic: 'dyanamicValue'
            });
          });
          describe('tagging re-attached component', () => {
            before(() => {
              helper.tagAllWithoutMessage();
              compId = `${helper.remoteScope}/comp/my-comp@0.0.4`;
              componentModel = helper.catComponent(compId);
            });
            it('should not mark the compiler as detached in models when tagging again', () => {
              expect(componentModel.detachedCompiler).to.be.undefined;
            });
            it('should not mark the tester as detached in models when tagging again', () => {
              expect(componentModel.detachedTester).to.be.undefined;
            });
          });
        });

        after(() => {
          helper.getClonedRemoteScope(remoteScopeBeforeChanges);
        });
      });
      describe('testing components', () => {
        before(() => {
          helper.getClonedLocalScope(authorScopeBeforeChanges);
        });
        describe('with success tests', () => {
          it('should show tests passed', () => {
            const output = helper.testComponent('comp/my-comp');
            expect(output).to.have.string('tests passed');
            expect(output).to.have.string('total duration');
            expect(output).to.have.string('✔   group of passed tests');
          });
        });
        describe('with failing tests', () => {
          before(() => {
            helper.createFile('', 'fail.spec.js', fixtures.failTest);
            helper.addComponentWithOptions('fail.spec.js', { i: 'comp/my-comp', t: 'fail.spec.js' });
          });
          describe('with default fork level', () => {
            it('should show results without define fork level', () => {
              const output = helper.testComponent('comp/my-comp');
              expect(output).to.have.string('tests failed');
              expect(output).to.have.string('✔   group of passed tests');
              expect(output).to.have.string('❌   group of failed tests');
            });
            it('should show results when there is exception on a test file', () => {
              helper.createFile('', 'exception.spec.js', fixtures.exceptionTest);
              let output;
              try {
                helper.addComponentWithOptions('exception.spec.js', { i: 'comp/my-comp', t: 'exception.spec.js' });
                helper.testComponent('comp/my-comp');
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
              helper.getClonedLocalScope(authorScopeBeforeChanges);
              helper.createFile('', 'fail.spec.js', fixtures.failTest);
              helper.addComponentWithOptions('fail.spec.js', { i: 'comp/my-comp', t: 'fail.spec.js' });
            });
            it('should show results with failing tests', () => {
              const output = helper.testComponentWithOptions('comp/my-comp', { '-fork-level': 'NONE' });
              expect(output).to.have.string('tests failed');
              expect(output).to.have.string('✔   group of passed tests');
              expect(output).to.have.string('❌   group of failed tests');
            });
            it('should show results when there is exception on a test file', () => {
              helper.createFile('', 'exception.spec.js', fixtures.exceptionTest);
              let output;
              try {
                helper.addComponentWithOptions('exception.spec.js', { i: 'comp/my-comp', t: 'exception.spec.js' });
                helper.testComponentWithOptions('comp/my-comp', { '-fork-level': 'NONE' });
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
              helper.getClonedLocalScope(authorScopeBeforeChanges);
              helper.createFile('', 'fail.spec.js', fixtures.failTest);
              helper.addComponentWithOptions('fail.spec.js', { i: 'comp/my-comp', t: 'fail.spec.js' });
            });
            it('should show results with failing tests', () => {
              const output = helper.testComponentWithOptions('comp/my-comp', { '-fork-level': 'ONE' });
              expect(output).to.have.string('tests failed');
              expect(output).to.have.string('✔   group of passed tests');
              expect(output).to.have.string('❌   group of failed tests');
            });
            it('should show results when there is exception on a test file', () => {
              helper.createFile('', 'exception.spec.js', fixtures.exceptionTest);
              let output;
              try {
                helper.addComponentWithOptions('exception.spec.js', { i: 'comp/my-comp', t: 'exception.spec.js' });
                helper.testComponentWithOptions('comp/my-comp', { '-fork-level': 'ONE' });
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
              helper.getClonedLocalScope(authorScopeBeforeChanges);
              helper.createFile('', 'fail.spec.js', fixtures.failTest);
              helper.addComponentWithOptions('fail.spec.js', { i: 'comp/my-comp', t: 'fail.spec.js' });
            });
            it('should show results with failing tests', () => {
              const output = helper.testComponentWithOptions('comp/my-comp', { '-fork-level': 'COMPONENT' });
              expect(output).to.have.string('tests failed');
              expect(output).to.have.string('✔   group of passed tests');
              expect(output).to.have.string('❌   group of failed tests');
            });
            it('should show results when there is exception on a test file', () => {
              helper.createFile('', 'exception.spec.js', fixtures.exceptionTest);
              let output;
              try {
                helper.addComponentWithOptions('exception.spec.js', { i: 'comp/my-comp', t: 'exception.spec.js' });
                helper.testComponentWithOptions('comp/my-comp', { '-fork-level': 'COMPONENT' });
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
      describe('changing envs files/config', () => {
        beforeEach(() => {
          // Restore to clean state of the scope
          helper.getClonedLocalScope(authorScopeBeforeChanges);
          // Make sure the component is not modified before the changes
          const statusOutput = helper.status();
          expect(statusOutput).to.have.string('nothing to tag or export');
          expect(statusOutput).to.not.have.string('modified');
        });
        describe('changing config files', () => {
          it('should show the component as modified after changing compiler config files', () => {
            helper.createFile('', '.babelrc', '{"some": "thing"}');
            const statusOutput = helper.status();
            expect(statusOutput).to.have.string('modified components');
            expect(statusOutput).to.have.string('comp/my-comp ... ok');
          });
          it('should show the component as modified after changing tester config files', () => {
            helper.createFile('', 'mocha-config.js', 'something');
            const statusOutput = helper.status();
            expect(statusOutput).to.have.string('modified components');
            expect(statusOutput).to.have.string('comp/my-comp ... ok');
          });
          it('bit-diff should show compiler file differences', () => {
            helper.createFile('', '.babelrc', '{"some": "thing"}');
            const diff = helper.diff('comp/my-comp');
            expect(diff).to.have.string('--- .babelrc (0.0.1 original)');
            expect(diff).to.have.string('+++ .babelrc (0.0.1 modified)');
            expect(diff).to.have.string('-  "minified": true,');
            expect(diff).to.have.string('+{"some": "thing"}');
          });
          it('bit-diff should show tester file differences', () => {
            helper.createFile('', 'mocha-config.js', 'something');
            const diff = helper.diff('comp/my-comp');
            expect(diff).to.have.string('--- config (0.0.1 original)');
            expect(diff).to.have.string('+++ config (0.0.1 modified)');
            expect(diff).to.have.string('-{"someConfKey": "someConfVal"}');
            expect(diff).to.have.string('+something');
            expect(diff).to.not.have.string('mocha-config.js'); // the relative path on the FS should not appear in the diff
          });
        });
        describe('changing envs raw config', () => {
          it('should show the component as modified after changing compiler raw config', () => {
            helper.addToRawConfigOfEnvInBitJson(undefined, 'a', 'c', 'compiler');
            const statusOutput = helper.status();
            expect(statusOutput).to.have.string('modified components');
            expect(statusOutput).to.have.string('comp/my-comp ... ok');
          });
          it('should show the component as modified after changning tester raw config', () => {
            helper.addToRawConfigOfEnvInBitJson(undefined, 'a', 'c', 'tester');
            const statusOutput = helper.status();
            expect(statusOutput).to.have.string('modified components');
            expect(statusOutput).to.have.string('comp/my-comp ... ok');
          });
          it('bit-diff should show compiler config differences', () => {
            helper.addToRawConfigOfEnvInBitJson(undefined, 'a', 'c', 'compiler');
            const diff = helper.diff('comp/my-comp');
            expect(diff).to.have.string('--- Compiler configuration (0.0.1 original)');
            expect(diff).to.have.string('+++ Compiler configuration (0.0.1 modified)');
            expect(diff).to.have.string('- "a": "b",');
            expect(diff).to.have.string('+ "a": "c",');
          });
          it('bit-diff should show tester config differences', () => {
            helper.addToRawConfigOfEnvInBitJson(undefined, 'a', 'c', 'tester');
            const diff = helper.diff('comp/my-comp');
            expect(diff).to.have.string('--- Tester configuration (0.0.1 original)');
            expect(diff).to.have.string('+++ Tester configuration (0.0.1 modified)');
            expect(diff).to.have.string('- "a": "b",');
            expect(diff).to.have.string('+ "a": "c",');
          });
        });
      });
    });
    describe('imported environment', () => {
      const componentFolder = path.join('components', 'comp', 'my-comp');

      describe('without ejceting (--conf)', () => {
        before(() => {
          helper.reInitLocalScope();
          helper.addRemoteScope();
          helper.addRemoteEnvironment();
          helper.importComponent('comp/my-comp');
        });
        it('should not show the component as modified after import', () => {
          // Make sure the component is not modified before the changes
          const statusOutput = helper.status();
          expect(statusOutput).to.have.string('nothing to tag or export');
          expect(statusOutput).to.not.have.string('modified');
        });
        it("should add the envPackageDependencies to devDependencies in component's package.json", () => {
          const packageJson = helper.readComponentPackageJson('comp/my-comp');
          const devDeps = packageJson.devDependencies;
          expect(devDeps).to.include({
            'babel-plugin-transform-object-rest-spread': '^6.26.0',
            'babel-preset-env': '^1.6.1',
            'lodash.get': '4.4.2'
          });
        });
        it('should build the component successfully', () => {
          // Chaning the component to make sure we really run a rebuild and not taking the dist from the models
          helper.createFile(componentFolder, 'objRestSpread.js', fixtures.objectRestSpreadWithChange);
          const output = helper.build('comp/my-comp');
          expect(output).to.have.string(path.join('dist', 'objRestSpread.js.map'));
          expect(output).to.have.string(path.join('dist', 'objRestSpread.js'));
          const distFilePath = path.join(
            helper.localScopePath,
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
              const output = helper.testComponent('comp/my-comp');
              expect(output).to.have.string('tests passed');
              expect(output).to.have.string('total duration');
              expect(output).to.have.string('✔   group of passed tests');
            });
          });
          describe('with failing tests', () => {
            before(() => {
              helper.createFile(componentFolder, 'fail.spec.js', fixtures.failTest);
              const failSpecPath = path.join(componentFolder, 'fail.spec.js');
              helper.addComponentWithOptions(failSpecPath, { i: 'comp/my-comp', t: failSpecPath });
            });
            describe('with default fork level', () => {
              it('should show results without define fork level', () => {
                const output = helper.testComponent('comp/my-comp');
                expect(output).to.have.string('tests failed');
                expect(output).to.have.string('✔   group of passed tests');
                expect(output).to.have.string('❌   group of failed tests');
              });
              it('should show results when there is exception on a test file', () => {
                helper.createFile(componentFolder, 'exception.spec.js', fixtures.exceptionTest);
                const exceptionSpecPath = path.join(componentFolder, 'exception.spec.js');

                let output;
                try {
                  helper.addComponentWithOptions(exceptionSpecPath, { i: 'comp/my-comp', t: exceptionSpecPath });
                  helper.testComponent('comp/my-comp');
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
      });
      describe('with ejceting (--conf)', () => {
        let fullComponentFolder;
        let bitJsonPath;

        describe('with default ejectedEnvsDirectory', () => {
          const envFilesFolder = path.join(componentFolder, DEFAULT_EJECTED_DIR_ENVS);
          const compilerFilesFolder = path.join(envFilesFolder, 'compiler');
          const testerFilesFolder = path.join(envFilesFolder, 'tester');
          let importedScopeBeforeChanges;
          before(() => {
            helper.reInitLocalScope();
            helper.addRemoteScope();
            helper.addRemoteEnvironment();
            helper.importComponentWithOptions('comp/my-comp', { '-conf': '' });
            importedScopeBeforeChanges = helper.cloneLocalScope();
            fullComponentFolder = path.join(helper.localScopePath, 'components', 'comp', 'my-comp');
            bitJsonPath = path.join(fullComponentFolder, 'bit.json');
          });
          it('should store the files under DEFAULT_EJECTED_ENVS_DIR_PATH', () => {
            const envFilesGlob = path.join(envFilesFolder, '**', '*');
            const envFiles = helper.getConsumerFiles(envFilesGlob);
            const babelrcPath = path.join(envFilesFolder, 'compiler', '.babelrc');
            expect(envFiles).to.include(babelrcPath);
            const mochaConfig = path.join(envFilesFolder, 'tester', 'config');
            expect(envFiles).to.include(mochaConfig);
          });
          it('should build the component successfully', () => {
            // Chaning the component to make sure we really run a rebuild and not taking the dist from the models
            helper.createFile(componentFolder, 'objRestSpread.js', fixtures.objectRestSpreadWithChange);
            const output = helper.build('comp/my-comp');
            expect(output).to.have.string(path.join('dist', 'objRestSpread.js.map'));
            expect(output).to.have.string(path.join('dist', 'objRestSpread.js'));
            const distFilePath = path.join(
              helper.localScopePath,
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
                const output = helper.testComponent('comp/my-comp');
                expect(output).to.have.string('tests passed');
                expect(output).to.have.string('total duration');
                expect(output).to.have.string('✔   group of passed tests');
              });
            });
            describe('with failing tests', () => {
              before(() => {
                helper.getClonedLocalScope(importedScopeBeforeChanges);
                helper.createFile(componentFolder, 'fail.spec.js', fixtures.failTest);
                const failSpecPath = path.join(componentFolder, 'fail.spec.js');
                helper.addComponentWithOptions(failSpecPath, { i: 'comp/my-comp', t: failSpecPath });
              });
              describe('with default fork level', () => {
                it('should show results without define fork level', () => {
                  const output = helper.testComponent('comp/my-comp');
                  expect(output).to.have.string('tests failed');
                  expect(output).to.have.string('✔   group of passed tests');
                  expect(output).to.have.string('❌   group of failed tests');
                });
                it('should show results when there is exception on a test file', () => {
                  helper.createFile(componentFolder, 'exception.spec.js', fixtures.exceptionTest);
                  const exceptionSpecPath = path.join(componentFolder, 'exception.spec.js');
                  helper.addComponentWithOptions(exceptionSpecPath, { i: 'comp/my-comp', t: exceptionSpecPath });
                  let output;
                  try {
                    helper.testComponent('comp/my-comp');
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
              helper.getClonedLocalScope(importedScopeBeforeChanges);
              bitJson = helper.readBitJson(bitJsonPath);
            });
            it('should write the compiler dynamic config as raw config', () => {
              const env = helper.getEnvFromBitJsonByType(bitJson, 'compiler');
              expect(env.rawConfig).to.include({
                a: 'b',
                valToDynamic: 'dyanamicValue'
              });
            });
            it('should write the tester dynamic config as raw config', () => {
              const env = helper.getEnvFromBitJsonByType(bitJson, 'tester');
              expect(env.rawConfig).to.include({
                a: 'b',
                valToDynamic: 'dyanamicValue'
              });
            });
          });
          it('should not show the component as modified if a file added to @bit-envs folder', () => {
            helper.getClonedLocalScope(importedScopeBeforeChanges);
            helper.createFile(compilerFilesFolder, 'someFile.js', '{"someConfKey": "someConfVal"}');
            helper.createFile(testerFilesFolder, 'someFile.js', '{"someConfKey": "someConfVal"}');
            const statusOutput = helper.status();
            expect(statusOutput).to.have.string('nothing to tag or export');
            expect(statusOutput).to.not.have.string('modified');
          });
          describe('attach - detach envs', () => {
            let compId = `${helper.remoteScope}/comp/my-comp@0.0.2`;
            let componentModel;
            let componentMap;
            before(() => {
              helper.getClonedLocalScope(importedScopeBeforeChanges);
            });
            describe('changing envs of imported component', () => {
              before(() => {
                helper.addToRawConfigOfEnvInBitJson(bitJsonPath, 'a', 'compiler', 'compiler');
                helper.addToRawConfigOfEnvInBitJson(bitJsonPath, 'a', 'tester', 'tester');
                helper.tagAllWithoutMessage();
                componentModel = helper.catComponent(compId);
                const bitmap = helper.readBitMap();
                componentMap = bitmap[compId];
              });
              it('should mark the compiler as detached in the models', () => {
                expect(componentModel.detachedCompiler).to.be.true;
              });
              it('should mark the tester as detached in the models', () => {
                expect(componentModel.detachedTester).to.be.true;
              });
              it('should mark the compiler as detached in .bitmap if the compiler is detached', () => {
                expect(componentMap.detachedCompiler).to.be.true;
              });
              it('should mark the tester as detached in .bitmap if the tester is detached', () => {
                expect(componentMap.detachedTester).to.be.true;
              });
              describe('tagging already detached component (without new envs changes)', () => {
                before(() => {
                  helper.createFile(componentFolder, 'objRestSpread.js', 'const g = 5;');
                  helper.tagAllWithoutMessage();
                  compId = `${helper.remoteScope}/comp/my-comp@0.0.3`;
                  componentModel = helper.catComponent(compId);
                });
                it('should mark the compiler as detached in the models', () => {
                  expect(componentModel.detachedCompiler).to.be.true;
                });
                it('should mark the tester as detached in the models', () => {
                  expect(componentModel.detachedTester).to.be.true;
                });
              });
            });
            describe('attach imported component', () => {
              let output;
              let compilerModel;
              let testerModel;
              before(() => {
                helper.getClonedLocalScope(importedScopeBeforeChanges);
                output = helper.envsAttach(['comp/my-comp'], { c: '', t: '' });
                const mockEnvs = {
                  compiler: {
                    [`${helper.envScope}/compilers/new-babel@0.0.1`]: {
                      rawConfig: {
                        a: 'my-compiler',
                        valToDynamic: 'dyanamicValue'
                      }
                    }
                  },
                  tester: {
                    [`${helper.envScope}/testers/new-mocha@0.0.1`]: {
                      rawConfig: {
                        a: 'my-tester',
                        valToDynamic: 'dyanamicValue'
                      }
                    }
                  }
                };
                helper.addKeyValToBitJson(undefined, 'env', mockEnvs);
                componentModel = helper.showComponentParsed('comp/my-comp');
                compilerModel = componentModel.compiler;
                testerModel = componentModel.tester;
                compId = `${helper.remoteScope}/comp/my-comp@0.0.1`;
                const bitmap = helper.readBitMap();
                componentMap = bitmap[compId];
              });
              it('should print to output the attached components', () => {
                expect(output).to.have.string(
                  'the following components has been attached to the workspace environments'
                );
                expect(output).to.have.string('comp/my-comp');
              });
              it('should load the compiler from workspace bit.json after attach compiler back', () => {
                expect(compilerModel.config).to.include({
                  a: 'my-compiler',
                  valToDynamic: 'dyanamicValue'
                });
              });
              it('should load the tester from workspace bit.json after attach tester back', () => {
                expect(testerModel.config).to.include({
                  a: 'my-tester',
                  valToDynamic: 'dyanamicValue'
                });
              });
              it('should mark the compiler as not detached in .bitmap if the compiler is attached', () => {
                expect(componentMap.detachedCompiler).to.be.false;
              });
              it('should mark the tester as not detached in .bitmap if the tester is attached', () => {
                expect(componentMap.detachedTester).to.be.false;
              });
              describe('tagging attached imported component', () => {
                before(() => {
                  helper.createFile(componentFolder, 'objRestSpread.js', 'const g = 5;');
                  helper.addRemoteEnvironment();
                  helper.tagAllWithoutMessage();
                  compId = `${helper.remoteScope}/comp/my-comp@0.0.2`;
                  componentModel = helper.catComponent(compId);
                });
                it('should mark the compiler as detached in the models since it was changed', () => {
                  expect(componentModel.detachedCompiler).to.be.true;
                });
                it('should mark the tester as detached in the models since it was changed', () => {
                  expect(componentModel.detachedTester).to.be.true;
                });
              });
            });
          });
          describe('change envs files/config', () => {
            before(() => {
              helper.getClonedLocalScope(importedScopeBeforeChanges);
            });
            beforeEach(() => {
              // Make sure the component is not modified before the changes
              const statusOutput = helper.status();
              expect(statusOutput).to.have.string('nothing to tag or export');
              expect(statusOutput).to.not.have.string('modified');
            });
            afterEach(() => {
              // Restore to clean state of the scope
              helper.getClonedLocalScope(importedScopeBeforeChanges);
            });
            it('should show the component as modified if compiler config has been changed', () => {
              helper.addToRawConfigOfEnvInBitJson(bitJsonPath, 'a', 'compiler', 'compiler');
              const statusOutput = helper.status();
              expect(statusOutput).to.have.string('modified components');
              expect(statusOutput).to.have.string('comp/my-comp ... ok');
            });
            it('should show the component as modified if tester config has been changed', () => {
              helper.addToRawConfigOfEnvInBitJson(bitJsonPath, 'a', 'tester', 'tester');
              const statusOutput = helper.status();
              expect(statusOutput).to.have.string('modified components');
              expect(statusOutput).to.have.string('comp/my-comp ... ok');
            });
            it('should show the component as modified if compiler file has been changed', () => {
              helper.createFile(compilerFilesFolder, '.babelrc', '{"some": "thing"}');
              const statusOutput = helper.status();
              expect(statusOutput).to.have.string('modified components');
              expect(statusOutput).to.have.string('comp/my-comp ... ok');
            });
            it('should show the component as modified if tester file has been changed', () => {
              helper.createFile(testerFilesFolder, 'config', 'something');
              const statusOutput = helper.status();
              expect(statusOutput).to.have.string('modified components');
              expect(statusOutput).to.have.string('comp/my-comp ... ok');
            });
          });
          it('should move envs files during bit move command', () => {
            const newComponentfolder = path.join('components', 'new-path');
            const newEnvFilesFolder = path.join(newComponentfolder, DEFAULT_EJECTED_DIR_ENVS);
            const envFilesGlob = path.join(newEnvFilesFolder, '**', '*');
            helper.move(componentFolder, newComponentfolder);
            const envFiles = helper.getConsumerFiles(envFilesGlob);
            const babelrcPath = path.join(newEnvFilesFolder, 'compiler', '.babelrc');
            expect(envFiles).to.include(babelrcPath);
            const mochaConfig = path.join(newEnvFilesFolder, 'tester', 'config');
            expect(envFiles).to.include(mochaConfig);
          });
        });
        describe('with custom ejectedEnvsDirectory', () => {
          const ejectedEnvsDirectory = 'custom-envs-config';
          const envFilesFolder = path.join(componentFolder, ejectedEnvsDirectory);
          const compilerFilesFolder = path.join(envFilesFolder, 'compiler');
          const testerFilesFolder = path.join(envFilesFolder, 'tester');
          let importedScopeBeforeChanges;

          before(() => {
            helper.reInitLocalScope();
            helper.addRemoteScope();
            helper.addRemoteEnvironment();
            const rootBitJsonPath = path.join(helper.localScopePath, 'bit.json');
            helper.addKeyValToBitJson(rootBitJsonPath, 'ejectedEnvsDirectory', 'custom-envs-config/{envType}');
            helper.importComponentWithOptions('comp/my-comp', { '-conf': '' });
            fullComponentFolder = path.join(helper.localScopePath, 'components', 'comp', 'my-comp');
            bitJsonPath = path.join(fullComponentFolder, 'bit.json');
            importedScopeBeforeChanges = helper.cloneLocalScope();
          });
          it('should store the files under the custom directory', () => {
            const envFilesGlob = path.join(envFilesFolder, '**', '*');
            const envFiles = helper.getConsumerFiles(envFilesGlob);
            const babelrcPath = path.join(envFilesFolder, 'compiler', '.babelrc');
            expect(envFiles).to.include(babelrcPath);
            const mochaConfig = path.join(envFilesFolder, 'tester', 'config');
            expect(envFiles).to.include(mochaConfig);
          });
          it('should not show the component as modified if a file added to ejectedEnvsDirectory', () => {
            helper.createFile('compilerFilesFolder', 'someFile.js', '{"someConfKey": "someConfVal"}');
            helper.createFile('testerFilesFolder', 'someFile.js', '{"someConfKey": "someConfVal"}');
            const statusOutput = helper.status();
            expect(statusOutput).to.have.string('nothing to tag or export');
            expect(statusOutput).to.not.have.string('modified');
          });
          describe('change envs files', () => {
            before(() => {
              helper.getClonedLocalScope(importedScopeBeforeChanges);
            });
            beforeEach(() => {
              // Make sure the component is not modified before the changes
              const statusOutput = helper.status();
              expect(statusOutput).to.have.string('nothing to tag or export');
              expect(statusOutput).to.not.have.string('modified');
            });
            afterEach(() => {
              // Restore to clean state of the scope
              helper.getClonedLocalScope(importedScopeBeforeChanges);
            });

            it('should show the component as modified if compiler file has been changed', () => {
              helper.createFile(compilerFilesFolder, '.babelrc', '{"some": "thing"}');
              const statusOutput = helper.status();
              expect(statusOutput).to.have.string('modified components');
              expect(statusOutput).to.have.string('comp/my-comp ... ok');
            });
            it('should show the component as modified if tester file has been changed', () => {
              helper.createFile(testerFilesFolder, 'config', 'something');
              const statusOutput = helper.status();
              expect(statusOutput).to.have.string('modified components');
              expect(statusOutput).to.have.string('comp/my-comp ... ok');
            });
          });
          it('should move envs files during bit move command', () => {
            const newComponentfolder = path.join('components', 'new-path');
            const newEnvFilesFolder = path.join(newComponentfolder, ejectedEnvsDirectory);
            const envFilesGlob = path.join(newEnvFilesFolder, '**', '*');
            helper.move(componentFolder, newComponentfolder);
            const envFiles = helper.getConsumerFiles(envFilesGlob);
            const babelrcPath = path.join(newEnvFilesFolder, 'compiler', '.babelrc');
            expect(envFiles).to.include(babelrcPath);
            const mochaConfig = path.join(newEnvFilesFolder, 'tester', 'config');
            expect(envFiles).to.include(mochaConfig);
          });
          it('should build the component successfully', () => {
            // Chaning the component to make sure we really run a rebuild and not taking the dist from the models
            helper.getClonedLocalScope(importedScopeBeforeChanges);
            helper.createFile(componentFolder, 'objRestSpread.js', fixtures.objectRestSpreadWithChange);
            const output = helper.build('comp/my-comp');
            expect(output).to.have.string(path.join('dist', 'objRestSpread.js.map'));
            expect(output).to.have.string(path.join('dist', 'objRestSpread.js'));
            const distFilePath = path.join(
              helper.localScopePath,
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
        });
      });
    });
  });
  describe('with dependencies', () => {
    const compilerId = 'compilers/webpack';
    // let authorScopeBeforeChanges;
    // let remoteScopeBeforeChanges;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const compiler = path.join('compilers', 'new-babel', 'compiler.js');
      helper.copyFixtureFile(compiler);
      helper.addComponentWithOptions('compiler.js', {
        i: compilerId
      });
      helper.reInitEnvsScope();
      helper.addRemoteEnvironment();
      helper.addNpmPackage('babel-core', '6.26.3');
      helper.addNpmPackage('fs-extra', '5.0.0');
      helper.addNpmPackage('mocha', '5.1.1');
      helper.addNpmPackage('vinyl', '2.1.0');
      helper.addNpmPackage('resolve', '1.7.1');
      helper.tagAllWithoutMessage();
      helper.exportAllComponents(helper.envScope);
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.initNpm();
      helper.addRemoteEnvironment();
      helper.importCompiler(`${helper.envScope}/${compilerId}`);
      helper.copyFixtureFile(path.join('compilers', 'webpack', 'base.config.js'));
      helper.copyFixtureFile(path.join('compilers', 'webpack', 'dev.config.js'));
      helper.addFileToEnvInBitJson(undefined, 'base.config.js', './base.config.js', 'compiler');
      helper.addFileToEnvInBitJson(undefined, 'dev.config.js', './dev.config.js', 'compiler');
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      // helper.installNpmPackage('babel-plugin-transform-object-rest-spread', '6.26.0');
      // helper.installNpmPackage('babel-preset-env', '1.6.1');
      // helper.installNpmPackage('chai', '4.1.2');
      // helper.tagAllWithoutMessage();
      // helper.exportAllComponents();
      // authorScopeBeforeChanges = helper.cloneLocalScope();
      // remoteScopeBeforeChanges = helper.cloneRemoteScope();
    });

    after(() => {
      helper.destroyEnv();
    });
    it.only('should work', () => {});
  });
});
