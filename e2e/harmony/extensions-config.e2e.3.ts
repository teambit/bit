import path from 'path';
import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('harmony extension config', function() {
  this.timeout(0);
  const helper = new Helper();

  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('persist extension config (provided by the user)to models', function() {
    describe('core extensions', () => {
      let componentVersionModel;
      const config = { key: 'val' };
      let extensionData;
      let devDeps;
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFoo();
        helper.extensions.setExtensionToVariant('*', 'Scope', config);
        helper.command.tagAllComponents();
        componentVersionModel = helper.command.catComponent('bar/foo@0.0.1');
        extensionData = componentVersionModel.extensions;
        devDeps = componentVersionModel.devDependencies;
      });
      it('should persist core extension config during tag', () => {
        expect(extensionData).to.be.length(1);
        expect(extensionData[0].config).to.deep.equal(config);
      });
      it('should not have version for core extension in the models', () => {
        expect(extensionData[0].name).to.equal('Scope');
      });
      it('should not insert core extensions into the component dev deps', () => {
        expect(devDeps).to.be.length(0);
      });
    });
    describe('3rd party extensions', () => {
      const config = { key: 'val' };
      let output;
      let localBeforeTag;

      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFoo();
        helper.fixtures.copyFixtureExtensions('dummy-extension');
        helper.command.addComponent('dummy-extension');
        helper.extensions.setExtensionToVariant('*', 'dummy-extension', config);
        localBeforeTag = helper.scopeHelper.cloneLocalScope();
      });
      describe('extension is new component on the workspace', () => {
        it('should not allow tagging the component without tagging the extensions', () => {
          output = helper.general.runWithTryCatch('bit tag bar/foo');
          expect(output).to.have.string('has an extension "dummy-extension"');
          expect(output).to.have.string('this extension was not included in the tag command');
        });
        describe('tagging extension and component together', () => {
          let componentModel;
          before(() => {
            helper.scopeHelper.getClonedLocalScope(localBeforeTag);
            helper.command.tagAllComponents();
            const componentModelStr = helper.command.catComponent('bar/foo@0.0.1', undefined, false);
            const componentModelStrWithoutExtString = componentModelStr.substring(componentModelStr.indexOf('{'));
            componentModel = JSON.parse(componentModelStrWithoutExtString);
          });
          it('should have version for extension in the component models when tagging with the component', () => {
            expect(componentModel.extensions[0].extensionId.version).to.equal('0.0.1');
          });
          it('should persist extension config during tag', () => {
            expect(componentModel.extensions[0].config).to.deep.equal(config);
          });
          it('should not insert extensions into the component dev deps', () => {
            expect(componentModel.devDependencies).to.be.of.length(0);
          });
          it('should auto tag the component when tagging the extension again', () => {
            output = helper.command.tagComponent('dummy-extension', 'message', '-f');
            expect(output).to.have.string('auto-tagged dependents');
            expect(output).to.have.string('bar/foo@0.0.2');
          });
        });
        describe('tagging extension then component', () => {
          let componentModel;
          before(() => {
            helper.scopeHelper.getClonedLocalScope(localBeforeTag);
            helper.command.tagComponent('dummy-extension');
            helper.command.tagComponent('bar/foo');
            const componentModelStr = helper.command.catComponent('bar/foo@0.0.1', undefined, false);
            const componentModelStrWithoutExtString = componentModelStr.substring(componentModelStr.indexOf('{'));
            componentModel = JSON.parse(componentModelStrWithoutExtString);
          });
          it('should have version for extension in the component models when tagging the extension before component', () => {
            expect(componentModel.extensions[0].extensionId.version).to.equal('0.0.1');
          });
          it('should not insert extensions into the component dev deps', () => {
            expect(componentModel.devDependencies).to.be.of.length(0);
          });
        });
        describe('exporting component with extension', () => {
          let localBeforeExport;
          let remoteBeforeExport;
          let componentModel;
          before(() => {
            helper.scopeHelper.getClonedLocalScope(localBeforeTag);
            helper.command.tagAllComponents();
            helper.scopeHelper.reInitRemoteScope();
            helper.scopeHelper.addRemoteScope();
            localBeforeExport = helper.scopeHelper.cloneLocalScope();
            remoteBeforeExport = helper.scopeHelper.cloneRemoteScope();
          });
          it('should block exporting component without exporting the extension', () => {
            output = helper.general.runWithTryCatch(`bit export ${helper.scopes.remote} bar/foo`);
            expect(output).to.have.string(`"${helper.scopes.remote}/dummy-extension@0.0.1" was not found`);
          });
          describe('exporting extension and component together', () => {
            before(() => {
              helper.command.exportAllComponents();
              const componentModelStr = helper.command.catComponent('bar/foo@0.0.1', undefined, false);
              const componentModelStrWithoutExtString = componentModelStr.substring(componentModelStr.indexOf('{'));
              componentModel = JSON.parse(componentModelStrWithoutExtString);
            });
            it('should update extension scope in the component when exporting together', () => {
              expect(componentModel.extensions[0].extensionId.scope).to.equal(helper.scopes.remote);
            });
          });
          describe('exporting extension then exporting component', () => {
            before(() => {
              helper.scopeHelper.getClonedLocalScope(localBeforeExport);
              helper.scopeHelper.getClonedRemoteScope(remoteBeforeExport);
              helper.command.exportComponent('dummy-extension');
              helper.command.exportComponent('bar/foo');
              const componentModelStr = helper.command.catComponent('bar/foo@0.0.1', undefined, false);
              const componentModelStrWithoutExtString = componentModelStr.substring(componentModelStr.indexOf('{'));
              componentModel = JSON.parse(componentModelStrWithoutExtString);
            });

            it('should update extension scope in the component when exporting component after exporting the extension', () => {
              expect(componentModel.extensions[0].extensionId.scope).to.equal(helper.scopes.remote);
            });
          });
        });
      });
      describe('imported component', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localBeforeTag);
          helper.scopeHelper.reInitRemoteScope();
          helper.scopeHelper.addRemoteScope();
          helper.command.tagComponent('dummy-extension');
          helper.command.exportComponent('dummy-extension');
          helper.extensions.setExtensionToVariant('*', `${helper.scopes.remote}/dummy-extension`, config);
          helper.command.tagAllComponents();
          helper.command.exportAllComponents();
          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
          helper.command.importComponent('bar/foo');
        });
        it('should auto-import the extensions as well', () => {
          const scopeList = helper.command.listLocalScopeParsed('--scope');
          const ids = scopeList.map(entry => entry.id);
          expect(ids).to.include(`${helper.scopes.remote}/dummy-extension`);
        });
      });
    });
  });
  describe('config added by extension', function() {
    const EXTENSIONS_BASE_FOLDER = 'extension-add-config';
    const config = { key: 'val' };
    let output;
    let localBeforeExtensions;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      localBeforeExtensions = helper.scopeHelper.cloneLocalScope();
    });

    describe('extension that add simple config', function() {
      before(() => {
        const extensionFolder = path.join(EXTENSIONS_BASE_FOLDER, 'simple-config');
        helper.fixtures.copyFixtureExtensions(extensionFolder);
        helper.command.addComponent(extensionFolder);
        helper.extensions.setExtensionToVariant('*', 'simple-config', config);
      });
      it('should run the add config hook', function() {
        output = helper.command.showComponent();
        expect(output).to.have.string('config registration hook is running');
      });
      it('should have the updated config in the package.json of the component in capsule', function() {
        const capsuleDir = helper.general.generateRandomTmpDirName();
        helper.command.isolateComponentWithCapsule('bar/foo', capsuleDir);
        const packageJson = helper.packageJson.read(capsuleDir);
        expect(packageJson).to.have.property('my-custom-key', 'my-custom-val');
      });
      it.skip('should have the updated config in another extension asks for the component', function() {});
    });
    describe.skip('conflict between few extensions on simple config', function() {});
    describe.skip('conflict between extension and user overrides ', function() {});
    describe('extensions that add another extensions', function() {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localBeforeExtensions);
        const extensionFolder = path.join(EXTENSIONS_BASE_FOLDER, 'nested-extensions');
        helper.fixtures.copyFixtureExtensions(extensionFolder);
        helper.command.addComponent(`${extensionFolder}/*`);
        helper.extensions.setExtensionToVariant('bar/foo', 'nested-extension-level1', config);
        output = helper.command.showComponent();
      });
      it('should runs all nested extensions', () => {
        expect(output).to.have.string('nested-extension-level1 runs');
        expect(output).to.have.string('nested-extension-level2 runs');
        expect(output).to.have.string('nested-extension-level3 runs');
      });
      it('should runs add config hook for all nested extensions', () => {
        expect(output).to.have.string('config registration hook is running for level 1');
        expect(output).to.have.string('config registration hook is running for level 2');
        expect(output).to.have.string('config registration hook is running for level 3');
      });
      it.skip('should only run add config event if the same extension added by many extensions', () => {});
      // In case an extension added another extension with config. the added extension should have access to this config
      it.skip('should have access for nested extension to the config set by a higher level', () => {});
    });
    describe.skip('extensions that add dependencies', function() {});
    describe.skip('extensions that add dependencies overrides', function() {});
  });
});
