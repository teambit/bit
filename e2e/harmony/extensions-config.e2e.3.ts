import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe.only('harmony extension config', function() {
  this.timeout(0);
  const helper = new Helper();

  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('core extensions', () => {
    let componentVersionModel;
    const config = { key: 'val' };
    let extensionData;
    let devDeps;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.extensions.addExtensionToWorkspaceConfig('Scope', config);
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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.extensions.createNewComponentExtension('my-ext', undefined, config);
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      localBeforeTag = helper.scopeHelper.cloneLocalScope();
    });
    describe('extension is new component on the workspace', () => {
      it('should not allow tagging the component without tagging the extensions', () => {
        output = helper.general.runWithTryCatch('bit tag bar/foo');
        expect(output).to.have.string('has a dependency "my-ext"');
        expect(output).to.have.string('this dependency was not included in the tag command');
      });
      it('should load the extension successfully with config', () => {
        const status = helper.command.status();
        expect(status).to.have.string(`hi there from an extension, got config: ${JSON.stringify(config)}`);
      });
      describe('tagging extension and component together', () => {
        let componentModel;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localBeforeTag);
          helper.command.tagAllComponents();
          const componentModelStr = helper.command.catComponent('bar/foo@0.0.1', undefined, false);
          const componentModelStrWithoutExtString = componentModelStr.substring(componentModelStr.indexOf('\n') + 1);
          componentModel = JSON.parse(componentModelStrWithoutExtString);
        });
        it('should have version for extension in the component models when tagging with the component', () => {
          expect(componentModel.extensions[0].extensionId.version).to.equal('0.0.1');
        });
        it('should persist extension config during tag', () => {
          expect(componentModel.extensions[0].config).to.deep.equal(config);
        });
        it('should insert extensions into the component dev deps', () => {
          expect(componentModel.devDependencies).to.be.of.length(1);
          expect(componentModel.devDependencies[0].id.name).to.equal('my-ext');
          expect(componentModel.devDependencies[0].id.version).to.equal('0.0.1');
        });
        it('should auto tag the component when tagging the extension again', () => {
          output = helper.command.tagComponent('my-ext', 'message', '-f');
          expect(output).to.have.string('auto-tagged dependents');
          expect(output).to.have.string('bar/foo@0.0.2');
        });
      });
      describe('tagging extension then component', () => {
        let componentModel;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localBeforeTag);
          helper.command.tagComponent('my-ext');
          helper.command.tagComponent('bar/foo');
          const componentModelStr = helper.command.catComponent('bar/foo@0.0.1', undefined, false);
          const componentModelStrWithoutExtString = componentModelStr.substring(componentModelStr.indexOf('\n') + 1);
          console.log('herererererre-------------1');
          console.log(componentModelStr);
          console.log('herererererre-------------2');
          console.log(componentModelStrWithoutExtString);
          console.log('herererererre-------------3');
          componentModel = JSON.parse(componentModelStrWithoutExtString);
        });
        it('should have version for extension in the component models when tagging the extension before component', () => {
          expect(componentModel.extensions[0].extensionId.version).to.equal('0.0.1');
        });
        it('should insert extensions into the component dev deps', () => {
          expect(componentModel.devDependencies).to.be.of.length(1);
          expect(componentModel.devDependencies[0].id.name).to.equal('my-ext');
          expect(componentModel.devDependencies[0].id.version).to.equal('0.0.1');
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
          expect(output).to.have.string(`"${helper.scopes.remote}/my-ext@0.0.1" was not found`);
        });
        describe('exporting extension and component together', () => {
          before(() => {
            helper.command.exportAllComponents();
            const componentModelStr = helper.command.catComponent('bar/foo@0.0.1', undefined, false);
            const componentModelStrWithoutExtString = componentModelStr.substring(componentModelStr.indexOf('\n') + 1);
            console.log('2222herererererre-------------1');
            console.log(componentModelStr);
            console.log('herererererre-------------2');
            console.log(componentModelStrWithoutExtString);
            console.log('herererererre-------------3');
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
            helper.command.exportComponent('my-ext');
            helper.command.exportComponent('bar/foo');
            const componentModelStr = helper.command.catComponent('bar/foo@0.0.1', undefined, false);
            const componentModelStrWithoutExtString = componentModelStr.substring(componentModelStr.indexOf('\n') + 1);
            componentModel = JSON.parse(componentModelStrWithoutExtString);
          });

          it('should update extension scope in the component when exporting component after exporting the extension', () => {
            expect(componentModel.extensions[0].extensionId.scope).to.equal(helper.scopes.remote);
          });
        });
      });
    });
  });
});
