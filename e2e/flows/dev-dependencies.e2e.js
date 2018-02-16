import path from 'path';
import chai, { expect } from 'chai';
import Helper from '../e2e-helper';
import * as fixtures from '../fixtures/fixtures';
import BitsrcTester, { username } from '../bitsrc-tester';

chai.use(require('chai-fs'));

describe('dev-dependencies functionality', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('environment with compiler and tester', () => {
    let clonedScope;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.importCompiler('bit.envs/compilers/babel');
      helper.importTester('bit.envs/testers/mocha@0.0.4');
      clonedScope = helper.cloneLocalScope();
    });
    describe('with dev-dependencies same as dependencies', () => {
      let barFoo;
      before(() => {
        helper.createComponent('utils', 'is-type.js', fixtures.isTypeES6);
        helper.addComponent('utils/is-type.js');
        helper.createComponent('utils', 'is-string.js', fixtures.isStringES6);
        helper.addComponent('utils/is-string.js');
        helper.createComponentBarFoo(fixtures.barFooES6);
        helper.addComponentBarFoo();

        helper.createFile('bar', 'foo.spec.js', fixtures.barFooSpecES6(true));
        helper.addNpmPackage('chai', '4.1.2');
        helper.addComponentWithOptions('bar/foo.js', { i: 'bar/foo', t: 'bar/foo.spec.js' });
        helper.build(); // needed for building the dependencies
        helper.commitAllComponents();
        barFoo = helper.catComponent('bar/foo@0.0.1');
      });
      it('should not save the dev-dependencies because they are the same as dependencies', () => {
        expect(barFoo.devDependencies).to.be.an('array').that.is.empty;
      });
      it('should not save the anything to flattened-dev-dependencies', () => {
        expect(barFoo.flattenedDevDependencies).to.be.an('array').that.is.empty;
      });
      it('should save "chai" in the dev-packages because it is only required in the tests files', () => {
        expect(barFoo.devPackageDependencies)
          .to.be.an('object')
          .that.has.property('chai');
      });
      it('should not save "chai" in the packages because it is not required in non-test files', () => {
        expect(barFoo.packageDependencies).to.be.an('object').that.is.empty;
      });
      it('should leave the dependencies intact', () => {
        expect(barFoo.dependencies)
          .to.be.an('array')
          .that.have.lengthOf(1);
        expect(barFoo.dependencies[0].id).to.equal('utils/is-string@0.0.1');
      });
      it('should leave the flattened-dependencies intact', () => {
        expect(barFoo.flattenedDependencies).to.include('utils/is-type@0.0.1');
        expect(barFoo.flattenedDependencies).to.include('utils/is-string@0.0.1');
      });
    });
    describe('without dependencies and with dev-dependencies', () => {
      let barFoo;
      let localScope;
      before(() => {
        // foo.js doesn't have any dependencies. foo.spec.js does have dependencies.
        helper.getClonedLocalScope(clonedScope);
        helper.createComponent('utils', 'is-type.js', fixtures.isTypeES6);
        helper.addComponent('utils/is-type.js');
        helper.createComponent('utils', 'is-string.js', fixtures.isStringES6);
        helper.addComponent('utils/is-string.js');
        helper.createComponentBarFoo('console.log("got foo")');
        helper.addComponentBarFoo();

        helper.createFile(
          'bar',
          'foo.spec.js',
          `const expect = require('chai').expect;
const foo = require('../utils/is-string.js');

describe('foo', () => {
  it('should display "got is-type and got is-string"', () => {
    expect(foo()).to.equal('got is-type and got is-string');
  });
});`
        );
        helper.addNpmPackage('chai', '4.1.2');
        helper.addComponentWithOptions('bar/foo.js', { i: 'bar/foo', t: 'bar/foo.spec.js' });
        helper.build(); // needed for building the dependencies
        helper.commitAllComponents();
        localScope = helper.cloneLocalScope();
        barFoo = helper.catComponent('bar/foo@0.0.1');
      });
      it('should save the dev-dependencies', () => {
        expect(barFoo.devDependencies)
          .to.be.an('array')
          .that.have.lengthOf(1);
        expect(barFoo.devDependencies[0].id).to.equal('utils/is-string@0.0.1');
      });
      it('should save the flattened-dev-dependencies', () => {
        expect(barFoo.flattenedDevDependencies).to.include('utils/is-type@0.0.1');
        expect(barFoo.flattenedDevDependencies).to.include('utils/is-string@0.0.1');
      });
      it('should save "chai" in the dev-packages', () => {
        expect(barFoo.devPackageDependencies)
          .to.be.an('object')
          .that.has.property('chai');
      });
      it('should not save "chai" in the packages', () => {
        expect(barFoo.packageDependencies).to.be.an('object').that.is.empty;
      });
      it('should not save anything into dependencies', () => {
        expect(barFoo.dependencies).to.be.an('array').that.is.empty;
      });
      it('should not save anything into flattened-dependencies', () => {
        expect(barFoo.flattenedDependencies).to.be.an('array').that.is.empty;
      });
      it('bit status should not show any component as modified', () => {
        const output = helper.runCmd('bit status');
        expect(output).to.have.a.string('no new components');
        expect(output).to.have.a.string('no modified components');
      });
      describe('export and import to a new scope', () => {
        before(() => {
          helper.exportAllComponents();
          helper.reInitLocalScope();
          helper.addRemoteScope();
          helper.importComponent('bar/foo');
        });
        it('tests should pass', () => {
          const output = helper.testComponent('bar/foo');
          expect(output).to.have.string('tests passed');
        });
      });
      describe('export and import dependencies as packages', () => {
        let scopeName;
        let scopeId;
        let bitsrcTester;
        before(() => {
          bitsrcTester = new BitsrcTester();
          helper.getClonedLocalScope(localScope);
          return bitsrcTester
            .loginToBitSrc()
            .then(() => bitsrcTester.createScope())
            .then((scope) => {
              scopeName = scope;
              scopeId = `${username}.${scopeName}`;
              helper.exportAllComponents(scopeId);
              helper.reInitLocalScope();
              helper.runCmd(`bit import ${scopeId}/bar/foo`);
            });
        });
        after(() => {
          return bitsrcTester.deleteScope(scopeName);
        });
        it('should save the bit-dev-dependencies component as devDependencies packages in package.json', () => {
          const packageJson = helper.readPackageJson(path.join(helper.localScopePath, 'components/bar/foo'));
          const id = `@bit/${scopeId}.utils.is-string`;
          expect(packageJson.dependencies).to.not.have.property(id);
          expect(packageJson.devDependencies).to.have.property(id);
        });
      });
    });
  });
});
