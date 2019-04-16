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
      before(() => {
        helper.importComponent('bar/foo');
        scopeAfterImport = helper.cloneLocalScope();
      });
      it('should write the configuration data into the component package.json file', () => {
        const packageJson = helper.readPackageJson(path.join(helper.localScopePath, 'components/bar/foo'));
        expect(packageJson).to.have.property('bit');
        expect(packageJson.bit).to.have.property('env');
      });
      describe('adding override to the package.json of the component', () => {});
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
    });
    describe('importing with --conf flag', () => {
      before(() => {
        helper.importComponent('bar/foo --conf');
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
