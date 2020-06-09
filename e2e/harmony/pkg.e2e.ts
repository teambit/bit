import path from 'path';
import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('pkg extension', function() {
  this.timeout(0);
  const helper = new Helper();

  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('config added by the user', function() {
    let barFooCapsuleDir;
    let isTypeCapsuleDir;

    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.createComponentUtilsIsType();
      helper.fixtures.addComponentUtilsIsType();
      const pkgConfig = {
        packageJson: {
          'some-key': 'some-val'
        }
      };
      helper.extensions.addExtensionToVariant('bar/foo', 'PkgExtension', pkgConfig);
      barFooCapsuleDir = helper.general.generateRandomTmpDirName();
      isTypeCapsuleDir = helper.general.generateRandomTmpDirName();
      helper.command.isolateComponentWithCapsule('bar/foo', barFooCapsuleDir);
      helper.command.isolateComponentWithCapsule('utils/is-type', isTypeCapsuleDir);
    });
    it('should have the updated config in the package.json of the configured component in capsule', function() {
      const packageJson = helper.packageJson.read(barFooCapsuleDir);
      expect(packageJson).to.have.property('some-key', 'some-val');
    });
    it('should not have the updated config in the package.json of another component in capsule', function() {
      const packageJson = helper.packageJson.read(isTypeCapsuleDir);
      expect(packageJson).to.not.have.property('some-key');
    });
  });
  // TODO: implement once we can extend a specific env with new methods (to apply config changes)
  // and maybe to also apply custom compiler which change props
  describe.skip('config added by an env', function() {});
  describe('config added by extension', function() {
    const EXTENSIONS_BASE_FOLDER = 'extension-add-config';
    const config = { key: 'val' };
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.createComponentUtilsIsType();
      helper.fixtures.addComponentUtilsIsType();
    });

    describe('extension that add simple config', function() {
      let barFooCapsuleDir;
      let isTypeCapsuleDir;

      before(() => {
        const extensionFolder = path.join(EXTENSIONS_BASE_FOLDER, 'simple-config');
        helper.fixtures.copyFixtureExtensions(extensionFolder);
        helper.command.addComponent(extensionFolder);
        helper.extensions.addExtensionToVariant('bar/foo', 'simple-config', config);
        barFooCapsuleDir = helper.general.generateRandomTmpDirName();
        isTypeCapsuleDir = helper.general.generateRandomTmpDirName();
        helper.command.isolateComponentWithCapsule('bar/foo', barFooCapsuleDir);
        helper.command.isolateComponentWithCapsule('utils/is-type', isTypeCapsuleDir);
      });
      it('should have the updated config in the package.json of the component with the defined extension in capsule', function() {
        const packageJson = helper.packageJson.read(barFooCapsuleDir);
        expect(packageJson).to.have.property('my-custom-key', 'my-custom-val');
      });
      it('should not have the updated config in the package.json of another component without the defined extension in capsule', function() {
        const packageJson = helper.packageJson.read(isTypeCapsuleDir);
        expect(packageJson).to.not.have.property('my-custom-key');
      });
      it.skip('should have the updated config in another extension asks for the component', function() {});
    });
    describe.skip('conflict between few extensions on simple config', function() {});
    describe.skip('conflict between extension and user overrides ', function() {});
    describe.skip('extensions that add dependencies', function() {});
    describe.skip('extensions that add dependencies overrides', function() {});
  });
});
