import path from 'path';
import chai, { expect } from 'chai';
import Helper from '../e2e-helper';
import * as fixtures from '../fixtures/fixtures';

chai.use(require('chai-fs'));

describe('component config', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('when importing a component', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.addComponentUtilsIsType();
      helper.createFile('utils', 'is-string.js', fixtures.isString);
      helper.addComponentUtilsIsString();
      helper.createComponentBarFoo(fixtures.barFooFixture);
      helper.addComponentBarFoo();
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
    });
    describe('importing without --conf flag', () => {
      let scopeAfterImport;
      let packageJson;
      before(() => {
        helper.importComponent('bar/foo');
        scopeAfterImport = helper.cloneLocalScope();
        packageJson = helper.readPackageJson(path.join(helper.localScopePath, 'components/bar/foo'));
      });
      it('should write the configuration data into the component package.json file', () => {
        expect(packageJson).to.have.property('bit');
        expect(packageJson.bit).to.have.property('env');
      });
      it('should not write the "overrides" key into bit as it is empty', () => {
        expect(packageJson).to.have.property('bit');
        expect(packageJson.bit).to.not.have.property('overrides');
      });
      describe('backward compatibility. saving the dependencies into bit.json as it was before v14.0.5', () => {
        before(() => {
          helper.getClonedLocalScope(scopeAfterImport);
          const componentDir = path.join(helper.localScopePath, 'components/bar/foo');
          const bitJson = helper.readBitJson(componentDir);
          bitJson.dependencies = { [`${helper.remoteScope}/utils/is-string`]: '0.0.1' };
          helper.writeBitJson(bitJson, componentDir);

          const consumerBitJson = helper.readBitJson();
          consumerBitJson.dependencies = { [`${helper.remoteScope}/bar/foo`]: '0.0.1' };
          helper.writeBitJson(bitJson);
        });
        it('Bit should not explode', () => {
          helper.showComponent('bar/foo');
          helper.status();
          helper.listLocalScope();
          helper.createFile('components/bar/foo/bar', 'foo.js', 'console.log("hello");');
          helper.tagAllComponents();
          helper.exportAllComponents();
        });
      });
      describe('changing the environments on package.json', () => {
        before(() => {
          helper.getClonedLocalScope(scopeAfterImport);
          const componentDir = path.join(helper.localScopePath, 'components/bar/foo');
          packageJson.bit.env = {
            compiler: 'my-scope/compiler/my-compiler'
          };
          helper.writePackageJson(packageJson, componentDir);
        });
        it('diff should show the newly added compiler', () => {
          const diff = helper.diff('bar/foo');
          expect(diff).to.have.string('--- Compiler');
          expect(diff).to.have.string('+++ Compiler');
          expect(diff).to.have.string('+ my-scope/compiler/my-compiler');
        });
      });
    });
    describe('importing with --conf flag', () => {
      before(() => {
        helper.importComponent('bar/foo --conf -O');
      });
      it('should write the configuration data also to bit.json file', () => {
        expect(path.join(helper.localScopePath, 'components/bar/foo/bit.json')).to.be.a.file();
      });
      it('bit.json should not include the "dependencies" property anymore', () => {
        const bitJson = helper.readBitJson('components/bar/foo');
        expect(bitJson).to.not.have.property('dependencies');
        expect(bitJson).to.not.have.property('packageDependencies');
      });
    });
  });
});
