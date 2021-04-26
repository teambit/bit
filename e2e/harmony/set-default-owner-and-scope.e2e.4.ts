import chai, { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';

import Helper from '../../src/e2e-helper/e2e-helper';
import { DEFAULT_OWNER } from '../../src/e2e-helper/e2e-scopes';
import * as fixtures from '../../src/fixtures/fixtures';

chai.use(require('chai-fs'));

describe('set default owner and scope', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('author components', () => {
    let parsedLinkOutput;
    let scopeWithoutOwner;
    let defaultScope;
    let componentId;
    let componentPackageName;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.disablePreview();
      scopeWithoutOwner = helper.scopes.remoteWithoutOwner;
      defaultScope = helper.scopes.remote;
      componentId = `${defaultScope}/utils/is-type`;
      componentPackageName = `@${DEFAULT_OWNER}/${scopeWithoutOwner}.utils.is-type`;
      const workspaceExtConfig = {
        defaultScope,
      };
      helper.extensions.addExtensionToWorkspace('teambit.workspace/workspace', workspaceExtConfig);
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.command.addComponent('utils', { i: 'utils/is-type' });
      const rawLinkOutput = helper.command.link('-j');
      parsedLinkOutput = JSON.parse(rawLinkOutput);
      helper.command.tagAllComponents();
    });
    it('should create link with default owner as prefix', () => {
      const linkFolderPath = path.normalize(`node_modules/${componentPackageName}`);
      const linkFullPath = path.join(linkFolderPath, 'is-type.js');
      const outputLinkPath = parsedLinkOutput.legacyLinkResults[0].bound[0].to;
      expect(outputLinkPath).to.equal(linkFullPath);
      expect(path.join(helper.scopes.localPath, 'node_modules')).to.be.a.directory();
      expect(path.join(helper.scopes.localPath, linkFolderPath)).to.be.a.directory();
    });
    describe('after export', () => {
      let exportOutput;
      before(() => {
        exportOutput = helper.command.export();
      });
      it('should export the component to correct scope', () => {
        expect(exportOutput).to.have.string('exported the following 1 component');
        expect(exportOutput).to.have.string(defaultScope);
      });
      describe('validate models data', () => {
        let compModel;
        let versionModel;
        before(() => {
          compModel = helper.command.catComponent(`utils/is-type`);
          versionModel = helper.command.catComponent(`utils/is-type@latest`);
        });
        it('should store scope name with the format owner.scope in the models', () => {
          expect(compModel.scope).to.equal(defaultScope);
        });
        it('should store scope name with the format owner.scope in the models', () => {
          expect(compModel.bindingPrefix).to.equal(`@${DEFAULT_OWNER}`);
          expect(versionModel.bindingPrefix).to.equal(`@${DEFAULT_OWNER}`);
        });
      });
      describe('post import', () => {
        before(() => {
          helper.scopeHelper.reInitLocalScopeHarmony();
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
              d: packDir,
            };
            helper.command.packComponent(componentIdWithVersion, options, true);
            const packageJsonPath = path.join(packDir, 'package', 'package.json');
            parsedJson = fs.readJsonSync(packageJsonPath);
          });
          it('should create package.json with correct name', () => {
            expect(parsedJson.name).to.equal(componentPackageName);
          });
          it('should have the component id in package.json', () => {
            expect(parsedJson.componentId.scope).to.equal(defaultScope);
            expect(parsedJson.componentId.name).to.equal('utils/is-type');
            expect(parsedJson.componentId.version).to.equal('0.0.1');
          });
        });
      });
    });
  });
});
