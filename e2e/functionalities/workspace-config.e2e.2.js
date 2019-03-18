import path from 'path';
import chai, { expect } from 'chai';
import Helper from '../e2e-helper';

chai.use(require('chai-fs'));

describe('workspace config', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('when the config exists in both bit.json and package.json', () => {
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
});
