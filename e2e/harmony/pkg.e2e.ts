import chai, { expect } from 'chai';
import path from 'path';

import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';

chai.use(require('chai-fs'));

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('pkg extension', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(HARMONY_FEATURE);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('config added by the user', function () {
    let barFooCapsuleDir;
    let isTypeCapsuleDir;

    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.fixtures.createComponentUtilsIsType();
      helper.fs.outputFile(path.join('utils', 'is-type.js'), fixtures.isType);
      helper.command.addComponent('utils', { i: 'utils/is-type' });
      const pkgConfig = {
        packageJson: {
          'some-key': 'some-val',
        },
      };
      helper.extensions.addExtensionToVariant('bar', 'teambit.pkg/pkg', pkgConfig);
      helper.command.createCapsuleHarmony('bar/foo');
      helper.command.createCapsuleHarmony('utils/is-type');
      // We do this because the create capsule dir with json is not working because of pnpm output
      barFooCapsuleDir = helper.command.getCapsuleOfComponent('bar/foo');
      isTypeCapsuleDir = helper.command.getCapsuleOfComponent('utils/is-type');
    });
    it('should have the updated config in the package.json of the configured component in capsule', function () {
      const packageJson = helper.packageJson.read(barFooCapsuleDir);
      expect(packageJson).to.have.property('some-key', 'some-val');
    });
    it('should not have the updated config in the package.json of another component in capsule', function () {
      const packageJson = helper.packageJson.read(isTypeCapsuleDir);
      expect(packageJson).to.not.have.property('some-key');
    });
    describe('after import', () => {
      before(() => {
        helper.command.tagAllComponents();
        helper.command.export();
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo');
      });
      it('should have the updated config in the package.json of the configured component in capsule', () => {
        helper.command.createCapsuleHarmony('bar/foo');
        // We do this because the create capsule dir with json is not working because of pnpm output
        barFooCapsuleDir = helper.command.getCapsuleOfComponent('bar/foo@0.0.1');
        const packageJson = helper.packageJson.read(barFooCapsuleDir);
        expect(packageJson).to.have.property('some-key', 'some-val');
      });
    });
  });
  // TODO: implement once we can extend a specific env with new methods (to apply config changes)
  // and maybe to also apply custom compiler which change props
  describe.skip('config added by an env', function () {});
  describe('config added by extension', function () {
    const EXTENSIONS_BASE_FOLDER = 'extension-add-config';
    const config = { key: 'val' };
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.fixtures.createComponentUtilsIsType();
      helper.fs.outputFile(path.join('utils', 'is-type.js'), fixtures.isType);
      helper.command.addComponent('utils', { i: 'utils/is-type' });
    });

    describe('extension that add simple config', function () {
      let barFooCapsuleDir;
      let isTypeCapsuleDir;

      before(() => {
        const extensionFolder = path.join(EXTENSIONS_BASE_FOLDER, 'simple-config');
        helper.fixtures.copyFixtureExtensions(extensionFolder);
        helper.command.addComponent(extensionFolder);
        helper.extensions.addExtensionToVariant(`${EXTENSIONS_BASE_FOLDER}/simple-config`, 'teambit.harmony/aspect');
        helper.extensions.addExtensionToVariant('bar', 'my-scope/simple-config', config);
        helper.command.install();
        helper.command.compile();
        helper.command.createCapsuleHarmony('bar/foo');
        helper.command.createCapsuleHarmony('utils/is-type');
        // We do this because the create capsule dir with json is not working because of pnpm output
        barFooCapsuleDir = helper.command.getCapsuleOfComponent('bar/foo');
        isTypeCapsuleDir = helper.command.getCapsuleOfComponent('utils/is-type');
      });
      it('should have the updated config in the package.json of the component with the defined extension in capsule', function () {
        const packageJson = helper.packageJson.read(barFooCapsuleDir);
        expect(packageJson).to.have.property('my-custom-key', 'my-custom-val');
      });
      it('should not have the updated config in the package.json of another component without the defined extension in capsule', function () {
        const packageJson = helper.packageJson.read(isTypeCapsuleDir);
        expect(packageJson).to.not.have.property('my-custom-key');
      });
      it.skip('should have the updated config in another extension asks for the component', function () {});
    });
    describe.skip('conflict between few extensions on simple config', function () {
      it.skip('should merge them', function () {});
    });
    describe.skip('conflict between extension and user overrides ', function () {
      it.skip('should prefer user config', function () {});
    });
    describe.skip('extensions that add protected fields', function () {
      // dependencies, devDeps, peerDeps, overrides, name, main file
      it.skip('should ignore all protected fields', function () {});
    });
  });
});
