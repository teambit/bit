import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';
import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import { generateRandomStr } from '../../src/utils';

chai.use(require('chai-fs'));

describe('publish functionality', function() {
  this.timeout(0);
  let helper: Helper;
  let npmCiRegistry: NpmCiRegistry;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(HARMONY_FEATURE);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('workspace with TS components', () => {
    let appOutput: string;
    let owner: string;
    let scopeBeforeTag: string;
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
      npmCiRegistry = new NpmCiRegistry(helper);
      helper.scopeHelper.reInitRemoteScope();
      npmCiRegistry.setCiScopeInBitJson();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      scopeBeforeTag = helper.scopeHelper.cloneLocalScope();
    });
    describe('publishing before tag', () => {
      it('should throw an error', () => {
        const output = helper.general.runWithTryCatch('bit publish comp1');
        expect(output).to.have.string(
          'unable to publish the following component(s), please make sure they are exported: comp1'
        );
      });
      // @todo
      it('should allow when --dry-run is specified', () => {});
    });
    describe('publishing before export', () => {
      before(() => {
        helper.command.tagAllComponents();
      });
      it('should throw an error when --allow-staged flag is not used', () => {
        const output = helper.general.runWithTryCatch('bit publish comp1');
        expect(output).to.have.string(
          'unable to publish the following component(s), please make sure they are exported: comp1'
        );
      });
    });
    (supportNpmCiRegistryTesting ? describe : describe.skip)('publishing the components', () => {
      before(async () => {
        await npmCiRegistry.init();
      });
      after(() => {
        npmCiRegistry.destroy();
      });
      describe('automatically by PostExport hook', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(scopeBeforeTag);
          helper.command.tagAllComponents();
          helper.command.exportAllComponents();
        });
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
      describe('using "bit publish"', () => {
        before(async () => {
          helper.scopeHelper.getClonedLocalScope(scopeBeforeTag);
          helper.command.tagScope('2.0.0');
          helper.command.publish('comp1', '--allow-staged');
          helper.command.publish('comp2', '--allow-staged');
          helper.command.publish('comp3', '--allow-staged');
        });
        // this also makes sure that the main of package.json points to the dist file correctly
        it('should publish them successfully and be able to consume them by installing the packages', () => {
          helper.scopeHelper.reInitLocalScope();
          helper.npm.initNpm();
          helper.npm.installNpmPackage(`${owner}/${helper.scopes.remote}.comp1`, '2.0.0');
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
  describe('with custom package name', function() {
    let randomStr: string;
    before(async function() {
      if (!supportNpmCiRegistryTesting) this.skip();
      npmCiRegistry = new NpmCiRegistry(helper);
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.outputFile('ui/button.js', 'console.log("hello button");');
      helper.command.addComponent('ui', { i: 'ui/button' });

      randomStr = generateRandomStr(4); // to avoid publishing the same package every time the test is running
      const name = `react.${randomStr}.{name}`;
      npmCiRegistry.configureCustomNameInPackageJsonHarmony(name);
      await npmCiRegistry.init();

      helper.command.tagAllComponents();
      helper.command.publish('ui/button', '--allow-staged');
    });
    after(() => {
      if (!supportNpmCiRegistryTesting) return;
      npmCiRegistry.destroy();
    });
    it('should publish them successfully and be able to consume them by installing the packages', () => {
      const pkgName = `react.${randomStr}.ui.button`;
      helper.scopeHelper.reInitLocalScope();
      helper.npm.initNpm();
      npmCiRegistry.installPackage(pkgName);

      helper.fs.outputFile('app.js', `require('${pkgName}');\n`);
      const output = helper.command.runCmd('node app.js');
      expect(output.trim()).to.be.equal('hello button');
    });
  });
});
