import chai, { expect } from 'chai';

import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import Helper from '../../src/e2e-helper/e2e-helper';
import { DEFAULT_OWNER } from '../../src/e2e-helper/e2e-scopes';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

chai.use(require('chai-fs'));

describe('import functionality on Harmony', function () {
  this.timeout(0);
  let helper: Helper;
  let npmCiRegistry: NpmCiRegistry;
  before(() => {
    helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
    helper.command.setFeatures(HARMONY_FEATURE);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('workspace with TS components', () => {
    let scopeWithoutOwner: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      scopeWithoutOwner = helper.scopes.remoteWithoutOwner;
      helper.fixtures.populateComponentsTS(3);
      npmCiRegistry = new NpmCiRegistry(helper);
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
      describe('installing dependencies as packages, requiring them and then running build-one-graph', () => {
        // let importOutput;
        before(() => {
          helper.scopeHelper.reInitLocalScopeHarmony();
          helper.scopeHelper.addRemoteScope();
          helper.npm.initNpm();
          helper.npm.installNpmPackage(`@${DEFAULT_OWNER}/${scopeWithoutOwner}.comp1`, '0.0.1');
          helper.fs.outputFile(
            'bar/app.js',
            `const comp1 = require('@${DEFAULT_OWNER}/${scopeWithoutOwner}.comp1').default;\nconsole.log(comp1())`
          );
          helper.command.addComponent('bar');
          // as an intermediate step, make sure the scope is empty.
          const localScope = helper.command.listLocalScopeParsed('--scope');
          expect(localScope).to.have.lengthOf(0);

          helper.command.runCmd('bit insights'); // this command happened to run the build-one-graph.
          // importOutput = helper.command.importAllComponents();
        });
        // it('should import the components objects that were installed as packages', () => {
        //   expect(importOutput).to.have.string('successfully imported one component');
        // });
        it('the scope should have the dependencies and the flattened dependencies', () => {
          const localScope = helper.command.listLocalScopeParsed('--scope');
          expect(localScope).to.have.lengthOf(3);
        });
      });
      describe('importing the components', () => {
        before(() => {
          helper.scopeHelper.reInitLocalScopeHarmony();
          npmCiRegistry.setResolver();
          helper.command.importComponent('comp1');
        });
        it('should not save the dependencies as components', () => {
          const bitMap = helper.bitMap.readComponentsMapOnly();
          expect(bitMap).to.have.property(`${helper.scopes.remote}/comp1@0.0.1`);
          expect(bitMap).not.to.have.property(`${helper.scopes.remote}/comp2@0.0.1`);
          expect(bitMap).not.to.have.property(`${helper.scopes.remote}/comp3@0.0.1`);
        });
        it('bit status should be clean with no errors', () => {
          helper.command.expectStatusToBeClean();
        });
      });
    });
  });
});
