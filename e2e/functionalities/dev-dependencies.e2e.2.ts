import chai, { expect } from 'chai';
import { Extensions } from '../../src/constants';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('dev-dependencies functionality', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('environment with compiler and tester', () => {
    describe('with dev-dependencies same as dependencies', () => {
      let comp1;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.bitJsonc.setupDefault();
        helper.fixtures.populateComponents();
        helper.fs.outputFile('comp1/foo.spec.js', 'require("chai");');
        helper.npm.addFakeNpmPackage('chai', '4.1.2');
        helper.bitJsonc.addPolicyToDependencyResolver({ dependencies: 'chai@4.1.2' });
        helper.command.tagAllWithoutBuild();
        comp1 = helper.command.catComponent('comp1@0.0.1');
      });
      it('should not save the dev-dependencies because they are the same as dependencies', () => {
        expect(comp1.devDependencies).to.be.an('array').that.is.empty;
      });
      it('should save "chai" in the dev-packages because it is only required in the tests files', () => {
        expect(comp1.devPackageDependencies).to.be.an('object').that.has.property('chai');
      });
      it('should not save "chai" in the packages because it is not required in non-test files', () => {
        expect(comp1.packageDependencies).to.be.an('object').that.is.empty;
      });
      it('should leave the dependencies intact', () => {
        expect(comp1.dependencies).to.be.an('array').that.have.lengthOf(1);
        expect(comp1.dependencies[0].id.name).to.equal('comp2');
        expect(comp1.dependencies[0].id.version).to.equal('0.0.1');
      });
      it('should leave the flattened-dependencies intact', () => {
        expect(comp1.flattenedDependencies).to.deep.include({ name: 'comp3', version: '0.0.1' });
        expect(comp1.flattenedDependencies).to.deep.include({ name: 'comp2', version: '0.0.1' });
      });
    });
    describe('without dependencies and with dev-dependencies', () => {
      let comp1;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.bitJsonc.setupDefault();
        // foo.js doesn't have any dependencies. foo.spec.js does have dependencies.
        helper.fixtures.populateComponents();
        helper.fs.outputFile('comp1/foo.spec.js', `require("chai"); require('@${helper.scopes.remote}/comp2');`);
        helper.fs.outputFile('comp1/index.js', '');
        helper.npm.addFakeNpmPackage('chai', '4.1.2');
        helper.bitJsonc.addPolicyToDependencyResolver({ dependencies: 'chai@4.1.2' });
        helper.command.tagAllWithoutBuild();
        comp1 = helper.command.catComponent('comp1@0.0.1');
      });
      it('should save the dev-dependencies', () => {
        expect(comp1.devDependencies).to.be.an('array').that.have.lengthOf(1);
        expect(comp1.devDependencies[0].id).to.deep.equal({ name: 'comp2', version: '0.0.1' });
      });
      it('should save the flattened-dependencies', () => {
        expect(comp1.flattenedDependencies).to.deep.include({ name: 'comp3', version: '0.0.1' });
        expect(comp1.flattenedDependencies).to.deep.include({ name: 'comp2', version: '0.0.1' });
      });
      it('should save "chai" in the dev-packages', () => {
        expect(comp1.devPackageDependencies).to.be.an('object').that.has.property('chai');
      });
      it('should not save "chai" in the packages', () => {
        expect(comp1.packageDependencies).to.be.an('object').that.is.empty;
      });
      it('should not save anything into dependencies', () => {
        expect(comp1.dependencies).to.be.an('array').that.is.empty;
      });
      it('should save the flattened dev-dependencies into flattened-dependencies', () => {
        expect(comp1.flattenedDependencies).to.be.an('array').with.lengthOf(2);
      });
      it('bit status should not show any component as modified', () => {
        const output = helper.command.runCmd('bit status');
        expect(output).to.have.string('staged components');
      });
    });
  });
  // (bar ->(prod)-> is-string ->(dev)->is-type ->(prod)-> baz)
  describe('dev-dependency of a nested component that originated from a prod dep', () => {
    let output;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(4);
      helper.fs.moveSync('comp2/index.js', 'comp2/foo.spec.js');
      helper.fs.outputFile('comp2/index.js');
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      output = helper.command.importComponent('*');
    });
    it('should be able to import with no errors', () => {
      expect(output).to.have.string('successfully imported');
    });
    it('bit status should show a clean state', () => {
      helper.command.expectStatusToBeClean();
    });
    it('the nested dev-dependency and nested prod of the nested dev-dependency should be saved in the flattenedDependencies', () => {
      const barFoo = helper.command.catComponent(`${helper.scopes.remote}/comp1@latest`);
      expect(barFoo.flattenedDependencies).to.have.lengthOf(3);
      const names = barFoo.flattenedDependencies.map((d) => d.name);
      expect(names).to.deep.equal(['comp2', 'comp3', 'comp4']);
    });
  });
  // (comp1 ->(dev)-> comp2 ->(dev)->comp3
  describe('dev-dependency of a nested component that originated from a dev dep', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(3);

      helper.fs.moveSync('comp1/index.js', 'comp1/foo.spec.js');
      helper.fs.outputFile('comp1/index.js');

      helper.fs.moveSync('comp2/index.js', 'comp2/foo.spec.js');
      helper.fs.outputFile('comp2/index.js');

      helper.fs.outputFile('comp3/index.js');

      helper.command.tagAllWithoutBuild();
    });
    it('the flattened dependencies should contain the entire chain of the dependencies', () => {
      const barFoo = helper.command.catComponent('comp1@latest');
      const names = barFoo.flattenedDependencies.map((d) => d.name);
      expect(names).to.include('comp3');
      expect(names).to.include('comp2');
    });
  });
  describe('dev-dependency that requires prod-dependency', () => {
    let barFoo;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.populateComponents(3);

      helper.fs.moveSync('comp1/index.js', 'comp1/foo.spec.js');
      helper.fs.outputFile('comp1/index.js');

      helper.command.tagAllWithoutBuild();
      barFoo = helper.command.catComponent('comp1@latest');

      // as an intermediate step, make sure barFoo has is-string as a dev dependency only
      expect(barFoo.dependencies).to.have.lengthOf(0);
      expect(barFoo.devDependencies).to.have.lengthOf(1);
      expect(barFoo.devDependencies[0].id.name).to.equal('comp2');
    });
    it('should include the prod dependencies inside flattenedDependencies', () => {
      expect(barFoo.flattenedDependencies).to.deep.include({ name: 'comp3', version: '0.0.1' });
    });
  });
  describe('component with devDependency coming from an env and is used as prod', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.bitJsonc.setupDefault();
      const envName = helper.env.setCustomEnv('node-env-dev-dep');
      const envId = `${helper.scopes.remote}/${envName}`;
      helper.extensions.addExtensionToVariant('*', envId);
      helper.fixtures.populateComponents(1, false);
      helper.fs.outputFile(`comp1/index.js`, `const isPositive = require('is-positive');`);
      helper.command.install();
      helper.command.tagWithoutBuild();
    });
    it('should be able to remove it from DevDependency only by "bit deps remove --dev"', () => {
      helper.command.dependenciesRemove('comp1', 'is-positive', '--dev');
      const bitMap = helper.bitMap.read();
      expect(bitMap.comp1.config[Extensions.dependencyResolver].policy).to.have.property('devDependencies');
      expect(bitMap.comp1.config[Extensions.dependencyResolver].policy.devDependencies['is-positive']).to.equal('-');
    });
  });
});
