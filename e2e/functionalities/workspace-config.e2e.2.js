import path from 'path';
import chai, { expect } from 'chai';
import Helper from '../e2e-helper';
import { IGNORE_DEPENDENCY } from '../../src/constants';

chai.use(require('chai-fs'));

describe('workspace config', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('when the, config exists in both bit.json and package.json', () => {
    let localScope;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.initNpm();
      const packageJson = helper.readPackageJson();
      packageJson.bit = {
        env: {},
        componentsDefaultDirectory: 'components/{name}',
        packageManager: 'npm'
      };
      helper.writePackageJson(packageJson);
      localScope = helper.cloneLocalScope();
    });
    describe('when the config conflicts between bit.json and package.json', () => {
      before(() => {
        const bitJson = helper.readBitJson();
        bitJson.componentsDefaultDirectory = 'customBitJson/{name}';
        helper.writeBitJson(bitJson);

        const packageJson = helper.readPackageJson();
        packageJson.bit.componentsDefaultDirectory = 'customPackageJson/{name}';
        helper.writePackageJson(packageJson);
      });
      it('should use the config from bit.json and not from package.json', () => {
        helper.importComponent('bar/foo');
        expect(path.join(helper.localScopePath, 'customBitJson')).to.be.a.directory();
        expect(path.join(helper.localScopePath, 'customPackageJson')).to.not.be.a.path();
      });
    });
    describe('when Bit writes config data', () => {
      before(() => {
        helper.getClonedLocalScope(localScope);
        helper.importComponent('bar/foo -c');
      });
      it('should write the config data to both bit.json and package.json', () => {
        const bitJson = helper.readBitJson();
        expect(bitJson.env).to.have.property('compiler');
        expect(bitJson.env.compiler).to.equal(`${helper.remoteScope}/bar/foo@0.0.1`);

        const packageJson = helper.readPackageJson();
        expect(packageJson.bit.env).to.have.property('compiler');
        expect(packageJson.bit.env.compiler).to.equal(`${helper.remoteScope}/bar/foo@0.0.1`);
      });
    });
  });
  describe.only('overrides components', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('', 'foo1.js');
      helper.createFile('', 'foo2.js');
      helper.createFile('', 'bar.js', "require('./foo1'); require('./foo2'); ");
      helper.addComponent('foo1.js');
      helper.addComponent('foo2.js');
      helper.addComponent('bar.js');
      helper.tagComponent('foo1');

      // as an intermediate step, make sure that tagging 'bar' throws an error because the dependency
      // foo2 was not tagged.
      const tagBar = () => helper.tagComponent('bar');
      expect(tagBar).to.throw();

      const bitJson = helper.readBitJson();
      bitJson.overrides = {
        bar: {
          dependencies: {
            foo2: '-'
          }
        }
      };
      helper.writeBitJson(bitJson);
    });
    describe('tagging the component', () => {
      let output;
      before(() => {
        output = helper.runWithTryCatch('bit tag bar');
      });
      it('should be able to tag successfully', () => {
        expect(output).to.have.string('1 components tagged');
      });
      it.only('should save the removed dependency with minus sign', () => {
        const bar = helper.catComponent('bar@latest');
        expect(bar.dependencies).to.have.lengthOf(2);
        const foo2Dep = bar.dependencies.find(dep => dep.id.name === 'foo2');
        expect(foo2Dep.id.version).to.equal(IGNORE_DEPENDENCY);
      });
      describe('importing the component', () => {
        before(() => {
          helper.exportAllComponents();
          helper.reInitLocalScope();
          helper.addRemoteScope();
          helper.importComponent('bar');
        });
        it('should work so far', () => {});
      });
    });
  });
});
