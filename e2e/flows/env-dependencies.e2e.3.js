import { expect } from 'chai';
import path from 'path';
import Helper from '../e2e-helper';
import { statusFailureMsg, statusInvalidComponentsMsg } from '../../src/cli/commands/public-cmds/status-cmd';

describe('environments with dependencies', function () {
  this.timeout(0);
  const helper = new Helper();
  const compilerId = 'compilers/webpack';
  let scopeBeforeTagging;
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
    helper.createComponentBarFoo();
    helper.addComponentBarFoo();
    scopeBeforeTagging = helper.cloneLocalScope();
  });
  after(() => {
    helper.destroyEnv();
  });
  describe('when a dependency file is not included in bit.json', () => {
    before(() => {
      helper.addFileToEnvInBitJson(undefined, 'dev.config.js', './dev.config.js', 'compiler');
    });
    it('should show the dependency file as untracked', () => {
      const output = helper.runCmd('bit status');
      expect(output).to.have.string(statusFailureMsg);
      expect(output).to.have.string('untracked');
      expect(output).to.have.string('dev.config.js -> base.config.js');
    });
  });
  describe('when a dependency file is not in the file system', () => {
    before(() => {
      helper.getClonedLocalScope(scopeBeforeTagging);
      helper.deleteFile('base.config.js');
      helper.addFileToEnvInBitJson(undefined, 'base.config.js', './base.config.js', 'compiler');
      helper.addFileToEnvInBitJson(undefined, 'dev.config.js', './dev.config.js', 'compiler');
    });
    it('should show the component as an invalid component', () => {
      const output = helper.runCmd('bit status');
      expect(output).to.have.string(statusInvalidComponentsMsg);
      expect(output).to.have.string('extension file is missing');
    });
  });
  describe('when all files exist and included in bit.json', () => {
    before(() => {
      helper.getClonedLocalScope(scopeBeforeTagging);
      helper.addFileToEnvInBitJson(undefined, 'base.config.js', './base.config.js', 'compiler');
      helper.addFileToEnvInBitJson(undefined, 'dev.config.js', './dev.config.js', 'compiler');
    });
    it('bit status should now show any missing', () => {
      const output = helper.runCmd('bit status');
      expect(output).to.not.have.string(statusFailureMsg);
      expect(output).to.not.have.string(statusInvalidComponentsMsg);
    });
  });
  describe('when a dependency file is a Bit component', () => {
    before(() => {
      helper.getClonedLocalScope(scopeBeforeTagging);
      helper.addFileToEnvInBitJson(undefined, 'dev.config.js', './dev.config.js', 'compiler');

      helper.addNpmPackage('webpack', '4.16.4');
      helper.addComponentWithOptions('base.config.js', { i: 'webpack/base' });
    });
    it('bit status should now show any missing', () => {
      const output = helper.runCmd('bit status');
      expect(output).to.not.have.string(statusFailureMsg);
      expect(output).to.not.have.string(statusInvalidComponentsMsg);
    });
    it('bit show should show environment dependency', () => {
      const showJson = helper.showComponentParsed('bar/foo');
      expect(showJson)
        .to.have.property('envDependencies')
        .that.is.an('array');
      expect(showJson.envDependencies).to.have.lengthOf(1);
      const envDependency = showJson.envDependencies[0];
      expect(envDependency.id).to.equal('webpack/base');
    });
    describe('after tagging the components', () => {
      let catComponent;
      before(() => {
        const output = helper.tagAllWithoutMessage();
        expect(output).to.have.string('2 components tagged');
        catComponent = helper.catComponent('bar/foo@latest');
      });
      it('should save the envDependencies in the model', () => {
        expect(catComponent).to.have.property('envDependencies');
        expect(catComponent.envDependencies).to.have.lengthOf(1);
        const envDependency = catComponent.envDependencies[0];
        expect(envDependency.id.name).to.equal('webpack/base');
        expect(envDependency.id.version).to.equal('0.0.1');
        expect(envDependency.relativePaths).to.have.lengthOf(1);
        const relativePath = envDependency.relativePaths[0];
        expect(relativePath.sourceRelativePath).to.equal('base.config.js');
        expect(relativePath.destinationRelativePath).to.equal('base.config.js');
      });
      it('should save the flattenedEnvDependencies in the model', () => {
        expect(catComponent).to.have.property('flattenedEnvDependencies');
        expect(catComponent.flattenedEnvDependencies).to.have.lengthOf(1);
        const flattenedEnvDependency = catComponent.flattenedEnvDependencies[0];
        expect(flattenedEnvDependency.name).to.equal('webpack/base');
        expect(flattenedEnvDependency.version).to.equal('0.0.1');
      });
      describe('importing the component to another scope', () => {
        before(() => {
          helper.exportAllComponents();
          helper.reInitLocalScope();
          helper.addRemoteScope();
          helper.importComponent('bar/foo');
        });
        it('should also import the environment component', () => {});
      });
    });
  });
});
