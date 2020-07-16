import chai, { expect } from 'chai';
import Helper, { HelperOptions } from '../../src/e2e-helper/e2e-helper';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';
import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import { generateRandomStr } from '../../src/utils';

chai.use(require('chai-fs'));

const defaultOwner = 'ci';

describe('publish functionality', function() {
  this.timeout(0);
  let helper: Helper;
  let npmCiRegistry: NpmCiRegistry;
  before(() => {
    const helperOptions: HelperOptions = {
      scopesOptions: {
        remoteScopeWithDot: true,
        remoteScopePrefix: defaultOwner
      }
    };
    helper = new Helper(helperOptions);
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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.bitJsonc.addDefaultScope();
      const remoteScopeParts = helper.scopes.remote.split('.');
      scopeWithoutOwner = remoteScopeParts[1];
      appOutput = helper.fixtures.populateComponentsTS(3, undefined, true);
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
      it('should allow when --dry-run is specified', () => {
        const output = helper.command.publish('comp1', '--dry-run');
        expect(output).to.have.string(`+ @${defaultOwner}/${scopeWithoutOwner}.comp1@0.0.1`);
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
          helper.npm.installNpmPackage(`@${defaultOwner}/${scopeWithoutOwner}.comp1`, '0.0.1');
          helper.fs.outputFile(
            'app.js',
            `const comp1 = require('@${defaultOwner}/${scopeWithoutOwner}.comp1').default;\nconsole.log(comp1())`
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
          helper.npm.installNpmPackage(`@${defaultOwner}/${scopeWithoutOwner}.comp1`, '2.0.0');
          helper.fs.outputFile(
            'app.js',
            `const comp1 = require('@${defaultOwner}/${scopeWithoutOwner}.comp1').default;\nconsole.log(comp1())`
          );
          const output = helper.command.runCmd('node app.js');
          expect(output.trim()).to.be.equal(appOutput.trim());
        });
      });
    });
  });
  (supportNpmCiRegistryTesting ? describe : describe.skip)('with custom package name', function() {
    let randomStr: string;
    let publishOutput: string;
    let pkgName: string;
    before(async function() {
      npmCiRegistry = new NpmCiRegistry(helper);
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.outputFile('ui/button.js', 'console.log("hello button");');
      helper.command.addComponent('ui', { i: 'ui/button' });

      randomStr = generateRandomStr(4); // to avoid publishing the same package every time the test is running
      const name = `react.${randomStr}.{name}`;
      npmCiRegistry.configureCustomNameInPackageJsonHarmony(name);
      await npmCiRegistry.init();

      helper.command.tagAllComponents();
      publishOutput = helper.command.publish('ui/button', '--allow-staged');
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
        helper.scopeHelper.reInitLocalScope();
        helper.npm.initNpm();
        npmCiRegistry.installPackage(pkgName);
      });
      it('should be able to consume them by installing the packages', () => {
        helper.fs.outputFile('app.js', `require('${pkgName}');\n`);
        const output = helper.command.runCmd('node app.js');
        expect(output.trim()).to.be.equal('hello button');
      });
      // @todo: make sure it gets also the scope-name
      describe('requiring the package from another component', () => {
        before(() => {
          helper.fs.outputFile('bar/foo.js', `const pkg = require('${pkgName}'); console.log(pkg);`);
          helper.command.addComponent('bar');
        });
        it('should recognize that the package is a component', () => {
          const show = helper.command.showComponentParsed('bar');
          expect(show.dependencies).to.have.lengthOf(1);
          expect(show.dependencies[0].id).equal('ui/button@0.0.1');
        });
      });
    });
  });
  describe('with invalid package name', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      npmCiRegistry = new NpmCiRegistry(helper);
      helper.fixtures.populateComponentsTS(1);
      const environments = {
        env: '@teambit/react',
        config: {}
      };
      helper.extensions.addExtensionToVariant('*', '@teambit/envs', environments);

      npmCiRegistry.configureCustomNameInPackageJsonHarmony('invalid/name/{name}');
    });
    it('builder should show the npm error about invalid name', () => {
      const output = helper.general.runWithTryCatch('bit run-new');
      expect(output).to.have.string('npm ERR! Invalid name: "invalid/name/comp1"');
    });
  });
});
