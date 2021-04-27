import chai, { expect } from 'chai';
import * as path from 'path';

import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

chai.use(require('chai-fs'));

describe('dev-dependencies functionality', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('environment with compiler and tester', () => {
    let clonedScope;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.env.importCompiler();
      helper.env.importTester();
      clonedScope = helper.scopeHelper.cloneLocalScope();
    });
    describe('with dev-dependencies same as dependencies', () => {
      let barFoo;
      before(() => {
        helper.fs.createFile('utils', 'is-type.js', fixtures.isTypeES6);
        helper.fixtures.addComponentUtilsIsType();
        helper.fs.createFile('utils', 'is-string.js', fixtures.isStringES6);
        helper.fixtures.addComponentUtilsIsString();
        helper.fixtures.createComponentBarFoo(fixtures.barFooES6);
        helper.fixtures.addComponentBarFoo();

        helper.fs.createFile('bar', 'foo.spec.js', fixtures.barFooSpecES6(true));
        helper.npm.installNpmPackage('chai', '4.1.2');
        helper.command.addComponent('bar/foo.js', { i: 'bar/foo', t: 'bar/foo.spec.js' });
        helper.command.build(); // needed for building the dependencies
        helper.command.tagAllComponents();
        barFoo = helper.command.catComponent('bar/foo@0.0.1');
      });
      it('should not save the dev-dependencies because they are the same as dependencies', () => {
        expect(barFoo.devDependencies).to.be.an('array').that.is.empty;
      });
      it('should save "chai" in the dev-packages because it is only required in the tests files', () => {
        expect(barFoo.devPackageDependencies).to.be.an('object').that.has.property('chai');
      });
      it('should not save "chai" in the packages because it is not required in non-test files', () => {
        expect(barFoo.packageDependencies).to.be.an('object').that.is.empty;
      });
      it('should leave the dependencies intact', () => {
        expect(barFoo.dependencies).to.be.an('array').that.have.lengthOf(1);
        expect(barFoo.dependencies[0].id.name).to.equal('utils/is-string');
        expect(barFoo.dependencies[0].id.version).to.equal('0.0.1');
      });
      it('should leave the flattened-dependencies intact', () => {
        expect(barFoo.flattenedDependencies).to.deep.include({ name: 'utils/is-type', version: '0.0.1' });
        expect(barFoo.flattenedDependencies).to.deep.include({ name: 'utils/is-string', version: '0.0.1' });
      });
    });
    describe('without dependencies and with dev-dependencies', () => {
      let barFoo;
      let localScope;
      before(() => {
        // foo.js doesn't have any dependencies. foo.spec.js does have dependencies.
        helper.scopeHelper.getClonedLocalScope(clonedScope);
        helper.fs.createFile('utils', 'is-type.js', fixtures.isTypeES6);
        helper.fixtures.addComponentUtilsIsType();
        helper.fs.createFile('utils', 'is-string.js', fixtures.isStringES6);
        helper.fixtures.addComponentUtilsIsString();
        helper.fixtures.createComponentBarFoo('console.log("got foo")');
        helper.fixtures.addComponentBarFoo();

        helper.fs.createFile(
          'bar',
          'foo.spec.js',
          `const expect = require('chai').expect;
const foo = require('../utils/is-string.js');

describe('foo', () => {
  it('should display "got is-type and got is-string"', () => {
    expect(foo.default()).to.equal('got is-type and got is-string');
  });
});`
        );
        helper.npm.installNpmPackage('chai', '4.1.2');
        helper.command.addComponent('bar/foo.js', { i: 'bar/foo', t: 'bar/foo.spec.js' });
        helper.command.build(); // needed for building the dependencies
        localScope = helper.scopeHelper.cloneLocalScope();
        helper.command.tagAllComponents();
        barFoo = helper.command.catComponent('bar/foo@0.0.1');
      });
      it('should save the dev-dependencies', () => {
        expect(barFoo.devDependencies).to.be.an('array').that.have.lengthOf(1);
        expect(barFoo.devDependencies[0].id).to.deep.equal({ name: 'utils/is-string', version: '0.0.1' });
      });
      it('should save the flattened-dependencies', () => {
        expect(barFoo.flattenedDependencies).to.deep.include({ name: 'utils/is-type', version: '0.0.1' });
        expect(barFoo.flattenedDependencies).to.deep.include({ name: 'utils/is-string', version: '0.0.1' });
      });
      it('should save "chai" in the dev-packages', () => {
        expect(barFoo.devPackageDependencies).to.be.an('object').that.has.property('chai');
      });
      it('should not save "chai" in the packages', () => {
        expect(barFoo.packageDependencies).to.be.an('object').that.is.empty;
      });
      it('should not save anything into dependencies', () => {
        expect(barFoo.dependencies).to.be.an('array').that.is.empty;
      });
      it('should save the flattened dev-dependencies into flattened-dependencies', () => {
        expect(barFoo.flattenedDependencies).to.be.an('array').with.lengthOf(2);
      });
      it('bit status should not show any component as modified', () => {
        const output = helper.command.runCmd('bit status');
        expect(output).to.have.string('staged components');
      });
      describe('export and import to a new scope', () => {
        before(() => {
          helper.command.exportAllComponents();
          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
          helper.scopeHelper.addGlobalRemoteScope();
          helper.command.importComponent('bar/foo');
        });
        it('tests should pass', () => {
          const output = helper.command.testComponent('bar/foo');
          expect(output).to.have.string('tests passed');
        });
      });

      (supportNpmCiRegistryTesting ? describe : describe.skip)('export and import dependencies as packages', () => {
        let npmCiRegistry: NpmCiRegistry;
        before(async () => {
          npmCiRegistry = new NpmCiRegistry(helper);
          helper.scopeHelper.getClonedLocalScope(localScope);
          helper.scopeHelper.reInitRemoteScope();
          npmCiRegistry.setCiScopeInBitJson();

          helper.command.tagAllComponents();
          helper.command.exportAllComponents();

          await npmCiRegistry.init();
          npmCiRegistry.publishEntireScope();

          helper.scopeHelper.reInitLocalScope();
          npmCiRegistry.setCiScopeInBitJson();
          npmCiRegistry.setResolver();
          helper.command.importComponent('bar/foo');
        });
        after(() => {
          npmCiRegistry.destroy();
        });
        it('should save the bit-dev-dependencies component as devDependencies packages in package.json', () => {
          const packageJson = helper.packageJson.read(path.join(helper.scopes.localPath, 'components/bar/foo'));
          const id = `@ci/${helper.scopes.remote}.utils.is-string`;
          expect(packageJson.dependencies).to.not.have.property(id);
          expect(packageJson.devDependencies).to.have.property(id);
        });
      });
    });
  });
  // (bar ->(prod)-> is-string ->(dev)->is-type ->(prod)-> baz)
  describe('dev-dependency of a nested component that originated from a prod dep', () => {
    let output;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('bar', 'foo.js', fixtures.barFooFixture);
      helper.fs.createFile('utils', 'is-string-spec.js', fixtures.isString);
      helper.fs.createFile('utils', 'is-string.js', '');
      helper.fs.createFile('utils', 'is-type.js', 'require("./baz");');
      helper.fs.createFile('utils', 'baz.js', '');
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.addComponentUtilsIsType();
      helper.command.addComponent('utils/is-string.js', {
        m: 'utils/is-string.js',
        i: 'utils/is-string',
        t: 'utils/is-string-spec.js',
      });
      helper.command.addComponent('utils/baz.js');
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      output = helper.command.importComponent('bar/foo');
    });
    it('should be able to import with no errors', () => {
      expect(output).to.have.string('successfully imported');
    });
    it('bit status should show a clean state', () => {
      helper.command.expectStatusToBeClean();
    });
    it('the nested dev-dependency and nested prod of the nested dev-dependency should be saved in the flattenedDependencies', () => {
      const barFoo = helper.command.catComponent(`${helper.scopes.remote}/bar/foo@latest`);
      expect(barFoo.flattenedDependencies).to.have.lengthOf(3);
      const names = barFoo.flattenedDependencies.map((d) => d.name);
      expect(names).to.deep.equal(['utils/is-string', 'utils/is-type', 'baz']);
    });
  });
  // (bar ->(dev)-> is-string ->(dev)->is-type
  describe('dev-dependency of a nested component that originated from a dev dep', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('utils', 'is-string-spec.js', fixtures.isString);
      helper.fs.createFile('utils', 'is-string.js', '');
      helper.fs.createFile('utils', 'is-type.js', '');
      helper.fixtures.addComponentUtilsIsType();
      helper.command.addComponent('utils/is-string.js', {
        m: 'utils/is-string.js',
        i: 'utils/is-string',
        t: 'utils/is-string-spec.js',
      });
      helper.command.tagAllComponents();

      helper.fs.createFile('bar', 'foo.js', '');
      helper.fs.createFile('bar', 'foo.spec.js', fixtures.barFooFixture);
      helper.command.addComponent('utils/is-string.js', {
        m: 'bar/foo.js',
        i: 'bar/foo',
        t: 'bar/foo.spec.js',
      });

      helper.command.tagAllComponents();
    });
    it('the flattened dependencies should contain the entire chain of the dependencies', () => {
      const barFoo = helper.command.catComponent('bar/foo@latest');
      const names = barFoo.flattenedDependencies.map((d) => d.name);
      expect(names).to.include('utils/is-type');
      expect(names).to.include('utils/is-string');
    });
  });
  describe('dev-dependency that requires prod-dependency', () => {
    let barFoo;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fs.createFile('bar', 'foo.spec.js', fixtures.barFooFixture);
      helper.fs.createFile('utils', 'is-string.js', fixtures.isString);
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.command.addComponent('bar', { i: 'bar/foo', m: 'bar/foo.js', t: 'bar/foo.spec.js' });
      helper.fixtures.addComponentUtilsIsString();
      helper.fixtures.addComponentUtilsIsType();
      helper.command.linkAndRewire();
      helper.command.tagAllComponents();
      barFoo = helper.command.catComponent('bar/foo@latest');

      // as an intermediate step, make sure barFoo has is-string as a dev dependency only
      expect(barFoo.dependencies).to.have.lengthOf(0);
      expect(barFoo.devDependencies).to.have.lengthOf(1);
      expect(barFoo.devDependencies[0].id.name).to.equal('utils/is-string');
    });
    it('should include the prod dependencies inside flattenedDependencies', () => {
      expect(barFoo.flattenedDependencies).to.deep.include({ name: 'utils/is-type', version: '0.0.1' });
    });
  });
});
