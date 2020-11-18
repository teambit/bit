import chai, { expect } from 'chai';

import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

// @TODO: REMOVE THE SKIP ASAP
describe('harmony extension config', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(HARMONY_FEATURE);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('persist extension config (provided by the user)to models', function () {
    describe('core extensions', () => {
      let componentVersionModel;
      const config = { key: 'val' };
      let extensionData;
      let devDeps;
      let scopeExtensionEntry;
      before(() => {
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFooAsDir();
        helper.extensions.addExtensionToVariant('*', 'teambit.scope/scope', config);
        helper.command.tagAllComponents();
        componentVersionModel = helper.command.catComponent('bar/foo@0.0.1');
        extensionData = componentVersionModel.extensions;
        devDeps = componentVersionModel.devDependencies;
        scopeExtensionEntry = extensionData.find((ext) => ext.name === 'teambit.scope/scope');
      });
      it('should persist core extension config during tag', () => {
        expect(scopeExtensionEntry).to.not.be.undefined;
        expect(scopeExtensionEntry.config).to.deep.equal(config);
      });
      it('should not have version for core extension in the models', () => {
        expect(extensionData[0].name).to.equal('teambit.scope/scope');
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
        const EXTENSION_FOLDER = 'dummy-extension';
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFooAsDir();
        helper.bitJsonc.addDefaultScope();
        helper.bitJsonc.disablePreview();
        helper.fixtures.copyFixtureExtensions(EXTENSION_FOLDER);
        helper.command.addComponent(EXTENSION_FOLDER);
        helper.extensions.addExtensionToVariant('*', `${helper.scopes.remote}/dummy-extension`, config);
        helper.extensions.addExtensionToVariant(EXTENSION_FOLDER, 'teambit.harmony/aspect');
        helper.command.link();
        helper.command.compile();
        localBeforeTag = helper.scopeHelper.cloneLocalScope();
      });
      describe('extension is new component on the workspace', () => {
        it('should not allow tagging the component without tagging the extensions', () => {
          output = helper.general.runWithTryCatch('bit tag bar/foo --persist');
          expect(output).to.have.string('has a dependency "dummy-extension"');
          expect(output).to.have.string('this dependency was not included in the tag command');
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
          it('should insert extensions flattened dependencies into the component dev flattened dependencies', () => {
            expect(componentModel.flattenedDevDependencies).to.be.of.length(1);
            expect(componentModel.flattenedDevDependencies[0].name).to.equal('dummy-extension');
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
          helper.extensions.addExtensionToVariant('*', `${helper.scopes.remote}/dummy-extension`, config);
          helper.command.tagAllComponents();
          helper.command.exportAllComponents();
          helper.scopeHelper.reInitLocalScopeHarmony();
          helper.scopeHelper.addRemoteScope();
          helper.command.importComponent('bar/foo');
        });
        it('should auto-import the extensions as well', () => {
          const scopeList = helper.command.listLocalScopeParsed('--scope');
          const ids = scopeList.map((entry) => entry.id);
          expect(ids).to.include(`${helper.scopes.remote}/dummy-extension`);
        });
      });
    });
  });
});
