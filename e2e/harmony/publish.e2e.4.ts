import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';
import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';

chai.use(require('chai-fs'));

describe('publish command', function() {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(HARMONY_FEATURE);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('workspace with TS components', () => {
    let appOutput: string;
    let owner;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      owner = '@ci';
      helper.bitJsonc.addDefaultScope();
      helper.bitJsonc.addDefaultOwner(owner);
      appOutput = helper.fixtures.populateComponentsTS(3, owner);
      const environments = {
        env: '@teambit/react',
        config: {}
      };
      helper.extensions.addExtensionToVariant('*', '@teambit/envs', environments);
    });
    describe('publishing before tag', () => {
      // @todo: complete
      it('should throw an error', () => {});
    });
    (supportNpmCiRegistryTesting ? describe : describe.skip)('publishing the components using "bit publish"', () => {
      let npmCiRegistry: NpmCiRegistry;
      before(async () => {
        npmCiRegistry = new NpmCiRegistry(helper);
        helper.scopeHelper.reInitRemoteScope();
        npmCiRegistry.setCiScopeInBitJson();
        npmCiRegistry.configureCiInPackageJsonHarmony();
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();
        await npmCiRegistry.init();
        npmCiRegistry.publishEntireScopeHarmony();
      });
      after(() => {
        npmCiRegistry.destroy();
      });
      // this also makes sure that the main of package.json points to the dist file correctly
      it('should publish them successfully and be able to consume them by installing the packages', () => {
        helper.scopeHelper.reInitLocalScope();
        helper.npm.initNpm();
        helper.npm.installNpmPackage(`${owner}/${helper.scopes.remote}.comp1`, '0.0.1');
        helper.fs.outputFile(
          'app.js',
          `const comp1 = require('${owner}/${helper.scopes.remote}.comp1').default;\nconsole.log(comp1())`
        );
        const output = helper.command.runCmd('node app.js');
        expect(output.trim()).to.be.equal(appOutput.trim());
      });
    });
  });
});
