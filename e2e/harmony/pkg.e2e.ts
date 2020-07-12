import path from 'path';
import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import * as fixtures from '../../src/fixtures/fixtures';

chai.use(require('chai-fs'));

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('pkg extension', function() {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(HARMONY_FEATURE);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('config added by the user', function() {
    let barFooCapsuleDir;
    let isTypeCapsuleDir;

    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.fixtures.createComponentUtilsIsType();
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.command.addComponent('utils', { i: 'utils/is-type' });
      const pkgConfig = {
        packageJson: {
          'some-key': 'some-val'
        }
      };
      helper.extensions.addExtensionToVariant('bar/foo', '@teambit/pkg', pkgConfig);
      barFooCapsuleDir = helper.command.createCapsuleHarmony('bar/foo');
      isTypeCapsuleDir = helper.command.createCapsuleHarmony('utils/is-type');
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
      helper.fixtures.addComponentBarFooAsDir();
      helper.fixtures.createComponentUtilsIsType();
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.command.addComponent('utils', { i: 'utils/is-type' });
    });

    describe('extension that add simple config', function() {
      let barFooCapsuleDir;
      let isTypeCapsuleDir;

      before(() => {
        const extensionFolder = path.join(EXTENSIONS_BASE_FOLDER, 'simple-config');
        helper.fixtures.copyFixtureExtensions(extensionFolder);
        helper.command.addComponent(extensionFolder);
        helper.extensions.addExtensionToVariant('bar/foo', 'my-scope/simple-config', config);
        barFooCapsuleDir = helper.command.createCapsuleHarmony('bar/foo');
        isTypeCapsuleDir = helper.command.createCapsuleHarmony('utils/is-type');
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
    describe.skip('conflict between few extensions on simple config', function() {
      it.skip('should merge them', function() {});
    });
    describe.skip('conflict between extension and user overrides ', function() {
      it.skip('should prefer user config', function() {});
    });
    describe.skip('extensions that add protected fields', function() {
      // dependencies, devDeps, peerDeps, overrides, name, main file
      it.skip('should ignore all protected fields', function() {});
    });
  });
});
