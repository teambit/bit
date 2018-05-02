import chai, { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import Helper from '../e2e-helper';
import * as fixtures from '../fixtures/fixtures';

chai.use(require('chai-fs'));

// should store the env files in the scope
// should send the env files to the remote scope
// should store the dynamic config in the models
// should support declare env in old format (string)
// should not show component in modified if the compiler defined in old format (string)
// should load the envs from component bit.json if exist
// should load the envs (include files) from models if there is no bit.json
// should load the envs from consumer bit.json for authored component
// eject env should create bit.json if not exists
// eject env twice should not break the bit.json
// eject only compiler or only tester
// eject to custom folder
// dynamic config should be written as raw config when ejecting
// change the default dir for envs (in consumer bit.json)
// imported - should not show the component as modified if a file added to @bit-envs folder
// author - should show the component as modified if an env file has been changed
// imported - should show the component as modified if an env file has been changed
// should not show components as modified for consumer bit.json in old format
// should not show components as modified for component with old model format
// should skip the test running if --skip-test flag provided during tag (move to tag.e2e)
// should move envs files during bit move command
// different fork levels should work
// Should store the dynamicPackageDependencies to envPackageDependencies in component models
// Component should not be modified after import when the envs didn't installed because of dynamicPackageDependencies (which we can't calculate without install the env)
// should show the envPackageDependencies when running bit show
// should add the envPackageDependencies to devDependencies in component's package.json
// envs with dynamicPackageDependencies should work (make sure the dynamicPackageDependencies are resolved correctly)

describe.only('envs', function () {
  this.timeout(0);
  const helper = new Helper();
  const compilerId = 'compilers/new-babel';
  const testerId = 'testers/new-mocha';
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
    helper.tagAllWithoutMessage();
    helper.exportAllComponents(helper.envScope);
    helper.reInitLocalScope();
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
    helper.addComponentWithOptions('objRestSpread.js', { i: 'comp/my-comp' });
    helper.installNpmPackage('babel-plugin-transform-object-rest-spread', '6.26.0');
    helper.installNpmPackage('babel-preset-env', '1.6.1');
    helper.installNpmPackage('chai', '4.1.2');
    helper.tagAllWithoutMessage();
    helper.cloneLocalScope();
  });

  after(() => {
    helper.destroyEnv();
  });

  describe('storing envs metadata in the models ', () => {
    let componentModel;
    let compilerModel;
    let testerModel;
    before(() => {
      componentModel = helper.catComponent('comp/my-comp@0.0.1');
      compilerModel = componentModel.compiler;
      testerModel = componentModel.tester;
    });

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
      const babelRcFromFS = fs.readFileSync(babelRcPath).toString();
      expect(babelRcFromModel).to.equal(babelRcFromFS);
    });
    it('should store the tester files in the model', () => {
      const mochaConfigHash = testerModel.files[0].file;
      const mochaConfigFromModel = helper.catObject(mochaConfigHash).trim();
      const mochaConfigPath = path.join(helper.localScopePath, 'mocha-config.js');
      const mochaConfigFromFS = fs.readFileSync(mochaConfigPath).toString();
      expect(mochaConfigFromModel).to.equal(mochaConfigFromFS);
    });
  });
});
