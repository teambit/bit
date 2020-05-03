import * as path from 'path';
import fs from 'fs-extra';
import chai, { expect } from 'chai';
import Helper, { HelperOptions } from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';
import { componentIssuesLabels } from '../../src/cli/templates/component-issues-template';

chai.use(require('chai-fs'));

// (supportNpmCiRegistryTesting ? describe : describe.skip)(
describe('set default owner and scope', function() {
  this.timeout(0);
  let helper: Helper;
  let npmCiRegistry;
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
    before(() => {
      helper.scopeHelper.initWorkspaceAndRemoteScope();
      const remoteScopeParts = helper.scopes.remote.split('.');
      defaultOwner = remoteScopeParts[0];
      defaultScope = remoteScopeParts[1];
      helper.bitJsonc.addDefaultOwner(defaultOwner);
      helper.bitJsonc.addDefaultScope(defaultScope);
      helper.fixtures.populateWorkspaceWithUtilsIsType();
      const rawLinkOutput = helper.command.link('-j');
      parsedLinkOutput = JSON.parse(rawLinkOutput);
      // helper.command.tagAllComponents();
    });
    it('should create link with default owner as prefix', () => {
      const linkFolderPath = path.normalize(`node_modules/@${defaultOwner}/${defaultScope}.utils.is-type`);
      const linkFullPath = path.join(linkFolderPath, '/utils/is-type.js');
      const outputLinkPath = parsedLinkOutput.linksResults[0].bound[0].to;
      expect(outputLinkPath).to.equal(linkFullPath);
      expect(path.join(helper.scopes.localPath, 'node_modules')).to.be.a.directory();
      expect(path.join(helper.scopes.localPath, linkFolderPath)).to.be.a.directory();
    });
    // validate links are correct
    // validate binding prefix are stored correctly in models
    // validate scope is stored correctly in models
    // validate export with no args using the owner
    // validate links created after import
    // validate name in package.json after pack command
  });
});
