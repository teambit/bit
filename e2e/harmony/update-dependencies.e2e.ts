import chai, { expect } from 'chai';

import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import Helper, { HelperOptions } from '../../src/e2e-helper/e2e-helper';
import { generateRandomStr } from '../../src/utils';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

chai.use(require('chai-fs'));

const defaultOwner = 'ci';

describe('update-dependencies command', function () {
  this.timeout(0);
  let helper: Helper;
  let npmCiRegistry: NpmCiRegistry;
  before(() => {
    const helperOptions: HelperOptions = {
      scopesOptions: {
        remoteScopeWithDot: true,
        remoteScopePrefix: defaultOwner,
      },
    };
    helper = new Helper(helperOptions);
    helper.command.setFeatures(HARMONY_FEATURE);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  (supportNpmCiRegistryTesting ? describe : describe.skip)('workspace with TS components', () => {
    let appOutput: string;
    let scopeBeforeTag: string;
    let scopeWithoutOwner: string;
    before(async () => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.addDefaultScope();
      helper.bitJsonc.disablePreview();
      const remoteScopeParts = helper.scopes.remote.split('.');
      scopeWithoutOwner = remoteScopeParts[1];
      helper.fixtures.populateComponents(1);
      npmCiRegistry = new NpmCiRegistry(helper);
      helper.scopeHelper.reInitRemoteScope();
      npmCiRegistry.setCiScopeInBitJson();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      await npmCiRegistry.init();
      helper.command.tagAllComponents();
      const secondRemote = helper.scopeHelper.getNewBareScope();
      helper.scopeHelper.addRemoteScope(secondRemote.scopePath);
      helper.fs.outputFile('comp-b/index.js', `require('@${defaultOwner}/${scopeWithoutOwner}.comp1');`);
      helper.command.addComponent('comp-b');
      helper.bitJsonc.addToVariant(undefined, 'comp-b', 'defaultScope', secondRemote.scopeName);
      helper.command.tagAllComponents();
      helper.command.export();
      helper.fixtures.populateComponents(1, undefined, ' v2');
      helper.command.tagComponent('comp1', undefined, '--skip-auto-tag');
      helper.command.export();
    });
    after(() => {
      npmCiRegistry.destroy();
    });
    it('should work', () => {});
  });
});
