import chai, { expect } from 'chai';

import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import Helper from '../../src/e2e-helper/e2e-helper';
import { DEFAULT_OWNER } from '../../src/e2e-helper/e2e-scopes';
import { generateRandomStr } from '../../src/utils';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

chai.use(require('chai-fs'));

describe('publish functionality', function () {
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
    let appOutput: string;
    let scopeBeforeTag: string;
    let scopeWithoutOwner: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      scopeWithoutOwner = helper.scopes.remoteWithoutOwner;
      appOutput = helper.fixtures.populateComponentsTS(3);
      npmCiRegistry = new NpmCiRegistry(helper);
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
    });
    (supportNpmCiRegistryTesting ? describe : describe.skip)('publishing the components', () => {
      before(async () => {
        await npmCiRegistry.init();
      });
      after(() => {
        npmCiRegistry.destroy();
      });
      describe('automatically by onPostPersistTag hook', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(scopeBeforeTag);
          helper.command.tagAllComponents();
        });
        it('should publish them successfully and be able to consume them by installing the packages', () => {
          helper.scopeHelper.reInitLocalScopeHarmony();
          helper.npm.initNpm();
          helper.npm.installNpmPackage(`@${DEFAULT_OWNER}/${scopeWithoutOwner}.comp1`, '0.0.1');
          helper.fs.outputFile(
            'app.js',
            `const comp1 = require('@${DEFAULT_OWNER}/${scopeWithoutOwner}.comp1').default;\nconsole.log(comp1())`
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
          helper.scopeHelper.reInitLocalScopeHarmony();
          helper.npm.initNpm();
          helper.npm.installNpmPackage(`@${DEFAULT_OWNER}/${scopeWithoutOwner}.comp1`, '2.0.0');
          helper.fs.outputFile(
            'app.js',
            `const comp1 = require('@${DEFAULT_OWNER}/${scopeWithoutOwner}.comp1').default;\nconsole.log(comp1())`
          );
          const output = helper.command.runCmd('node app.js');
          expect(output.trim()).to.be.equal(appOutput.trim());
        });
      });
    });
  });
  (supportNpmCiRegistryTesting ? describe : describe.skip)('with custom package name', function () {
    let randomStr: string;
    let publishOutput: string;
    let pkgName: string;
    before(async function () {
      npmCiRegistry = new NpmCiRegistry(helper);
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.disablePreview();
      helper.fs.outputFile('ui/button.js', 'console.log("hello button");');
      helper.command.addComponent('ui', { i: 'ui/button' });

      randomStr = generateRandomStr(4); // to avoid publishing the same package every time the test is running
      const name = `react.${randomStr}.{name}`;
      npmCiRegistry.configureCustomNameInPackageJsonHarmony(name);
      await npmCiRegistry.init();

      publishOutput = helper.command.tagAllComponents();
      pkgName = `react.${randomStr}.ui.button`;
    });
    after(() => {
      npmCiRegistry.destroy();
    });
    it('should publish them successfully', () => {
      expect(publishOutput).to.have.string(pkgName);
    });
    describe('installing the component as a package', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.npm.initNpm();
        npmCiRegistry.installPackage(pkgName);
      });
      it('should be able to consume them by installing the packages', () => {
        helper.fs.outputFile('app.js', `require('${pkgName}');\n`);
        const output = helper.command.runCmd('node app.js');
        expect(output.trim()).to.be.equal('hello button');
      });
      describe('requiring the package from another component', () => {
        before(() => {
          helper.fs.outputFile('bar/foo.js', `const pkg = require('${pkgName}'); console.log(pkg);`);
          helper.command.addComponent('bar');
        });
        it('should recognize that the package is a component', () => {
          const show = helper.command.showComponentParsed('bar');
          expect(show.dependencies).to.have.lengthOf(1);
          expect(show.dependencies[0].id).equal('my-scope/ui/button@0.0.1');
        });
      });
    });
  });
  describe('with invalid package name', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      npmCiRegistry = new NpmCiRegistry(helper);
      helper.fixtures.populateComponentsTS(1);
      npmCiRegistry.configureCustomNameInPackageJsonHarmony('invalid/name/{name}');
    });
    it('builder should show the npm error about invalid name', () => {
      const output = helper.general.runWithTryCatch('bit build');
      expect(output).to.have.string('npm ERR! Invalid name: "invalid/name/comp1"');
    });
  });
});
