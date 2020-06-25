import * as path from 'path';
import fs from 'fs-extra';
import chai, { expect } from 'chai';
import Helper, { HelperOptions } from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';

chai.use(require('chai-fs'));

// (supportNpmCiRegistryTesting ? describe : describe.skip)(
describe('set default owner and scope', function() {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    const helperOptions: HelperOptions = {
      scopesOptions: {
        remoteScopeWithDot: true
      }
    };
    helper = new Helper(helperOptions);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('author components', () => {
    let parsedLinkOutput;
    let defaultOwner;
    let defaultScope;
    let fullScope;
    let componentId;
    let componentPackageName;
    before(() => {
      helper.scopeHelper.initWorkspaceAndRemoteScope();
      const remoteScopeParts = helper.scopes.remote.split('.');
      defaultOwner = remoteScopeParts[0];
      defaultScope = remoteScopeParts[1];
      fullScope = `${defaultOwner}.${defaultScope}`;
      componentId = `${fullScope}/utils/is-type`;
      componentPackageName = `@${defaultOwner}/${defaultScope}.utils.is-type`;
      const workspaceExtConfig = {
        defaultOwner,
        defaultScope
      };
      helper.extensions.addExtensionToWorkspace('@teambit/workspace', workspaceExtConfig);
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.command.addComponent('utils', { i: 'utils/is-type' });
      const rawLinkOutput = helper.command.link('-j');
      parsedLinkOutput = JSON.parse(rawLinkOutput);
      helper.command.tagAllComponents();
    });
    it('should create link with default owner as prefix', () => {
      const linkFolderPath = path.normalize(`node_modules/${componentPackageName}`);
      const linkFullPath = path.join(linkFolderPath, 'is-type.js');
      const outputLinkPath = parsedLinkOutput.linksResults[0].bound[0].to;
      expect(outputLinkPath).to.equal(linkFullPath);
      expect(path.join(helper.scopes.localPath, 'node_modules')).to.be.a.directory();
      expect(path.join(helper.scopes.localPath, linkFolderPath)).to.be.a.directory();
    });
    describe('after export', () => {
      let exportOutput;
      before(() => {
        exportOutput = helper.command.exportAllComponents();
      });
      it('should export the component to correct scope', () => {
        expect(exportOutput).to.have.string('exported 1 components');
        expect(exportOutput).to.have.string(`${defaultOwner}.${defaultScope}`);
      });
      describe('validate models data', () => {
        let compModel;
        let versionModel;
        before(() => {
          compModel = helper.command.catComponent(`utils/is-type`);
          versionModel = helper.command.catComponent(`utils/is-type@latest`);
        });
        it('should store scope name with the format owner.scope in the models', () => {
          expect(compModel.scope).to.equal(`${fullScope}`);
        });
        it('should store scope name with the format owner.scope in the models', () => {
          expect(compModel.bindingPrefix).to.equal(`@${defaultOwner}`);
          expect(versionModel.bindingPrefix).to.equal(`@${defaultOwner}`);
        });
      });
      describe('post import', () => {
        before(() => {
          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
          helper.command.importComponent('utils/is-type');
        });
        it('should create links for the imported components', () => {
          const linkFolderPath = path.normalize(`node_modules/${componentPackageName}`);
          expect(path.join(helper.scopes.localPath, 'node_modules')).to.be.a.directory();
          expect(path.join(helper.scopes.localPath, linkFolderPath)).to.be.a.directory();
        });
        describe('pack component', () => {
          let parsedJson;
          before(() => {
            const componentIdWithVersion = `${componentId}@0.0.1`;
            const packDir = path.join(helper.scopes.localPath, 'pack');
            const options = {
              d: packDir
            };
            helper.command.packComponent(componentIdWithVersion, options, true);
            const packageJsonPath = path.join(packDir, 'package', 'package.json');
            parsedJson = fs.readJsonSync(packageJsonPath);
          });
          it('should create package.json with correct name', () => {
            expect(parsedJson.name).to.equal(componentPackageName);
          });
          it('should have the component id in package.json', () => {
            expect(parsedJson.componentId.scope).to.equal(`${defaultOwner}.${defaultScope}`);
            expect(parsedJson.componentId.name).to.equal('utils/is-type');
            expect(parsedJson.componentId.version).to.equal('0.0.1');
          });
        });
      });
    });
  });
});
