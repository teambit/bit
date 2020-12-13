import chai, { expect } from 'chai';

import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import Helper, { HelperOptions } from '../../src/e2e-helper/e2e-helper';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

chai.use(require('chai-fs'));

const defaultOwner = 'ci';

describe('import functionality on Harmony', function () {
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
  describe('workspace with TS components', () => {
    let scopeWithoutOwner: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.addDefaultScope();
      helper.bitJsonc.disablePreview();
      const remoteScopeParts = helper.scopes.remote.split('.');
      scopeWithoutOwner = remoteScopeParts[1];
      helper.fixtures.populateComponentsTS(3, undefined, true);
      helper.extensions.addExtensionToVariant('*', 'teambit.react/react', {});
      npmCiRegistry = new NpmCiRegistry(helper);
      helper.scopeHelper.reInitRemoteScope();
      npmCiRegistry.setCiScopeInBitJson();
      npmCiRegistry.configureCiInPackageJsonHarmony();
    });
    (supportNpmCiRegistryTesting ? describe : describe.skip)('tag and export', () => {
      before(async () => {
        await npmCiRegistry.init();
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();
      });
      after(() => {
        npmCiRegistry.destroy();
      });
      describe('importing dependencies as packages, requiring them and then running bit import', () => {
        let importOutput;
        before(() => {
          helper.scopeHelper.reInitLocalScopeHarmony();
          helper.scopeHelper.addRemoteScope();
          helper.npm.initNpm();
          helper.npm.installNpmPackage(`@${defaultOwner}/${scopeWithoutOwner}.comp1`, '0.0.1');
          helper.fs.outputFile(
            'bar/app.js',
            `const comp1 = require('@${defaultOwner}/${scopeWithoutOwner}.comp1').default;\nconsole.log(comp1())`
          );
          helper.command.addComponent('bar');
          // as an intermediate step, make sure the scope is empty.
          const localScope = helper.command.listLocalScopeParsed('--scope');
          expect(localScope).to.have.lengthOf(0);

          importOutput = helper.command.importAllComponents();
        });
        it('should import the components objects that were installed as packages', () => {
          expect(importOutput).to.have.string('successfully imported one component');
        });
        it('the scope should have the dependencies and the flattened dependencies', () => {
          const localScope = helper.command.listLocalScopeParsed('--scope');
          expect(localScope).to.have.lengthOf(3);
        });
      });
    });
  });
});
