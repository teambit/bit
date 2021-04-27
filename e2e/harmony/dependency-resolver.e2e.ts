import chai, { expect } from 'chai';
import path from 'path';
import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import { Extensions } from '../../src/constants';
import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';
import { generateRandomStr } from '../../src/utils';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

chai.use(require('chai-fs'));

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('dependency-resolver extension', function () {
  let helper: Helper;
  this.timeout(0);
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(HARMONY_FEATURE);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('policies changes', function () {
    describe('policies added by the user', function () {
      let barFooOutput;
      let isTypeOutput;

      before(() => {
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFooAsDir();
        helper.fixtures.createComponentUtilsIsType();
        helper.fs.outputFile(path.join('utils', 'is-type.js'), fixtures.isType);
        helper.command.addComponent('utils', { i: 'utils/is-type' });
        const depResolverConfig = {
          policy: {
            dependencies: {
              'lodash.get': '4.0.0',
            },
            devDependencies: {
              'lodash.words': '4.0.0',
            },
            peerDependencies: {
              'lodash.set': '4.0.0',
            },
          },
        };
        helper.extensions.addExtensionToVariant('bar', 'teambit.dependencies/dependency-resolver', depResolverConfig);
        barFooOutput = helper.command.showComponentParsed('bar/foo');
        isTypeOutput = helper.command.showComponentParsed('utils/is-type');
      });
      it('should have the updated dependencies for bar/foo', function () {
        expect(barFooOutput.packageDependencies).to.have.property('lodash.get', '4.0.0');
        expect(barFooOutput.devPackageDependencies).to.have.property('lodash.words', '4.0.0');
        expect(barFooOutput.peerPackageDependencies).to.have.property('lodash.set', '4.0.0');
      });
      it('should not put the dependencies for not configured component', function () {
        expect(isTypeOutput.packageDependencies).to.not.have.key('lodash.get');
        expect(isTypeOutput.devPackageDependencies).to.not.have.key('lodash.words');
        expect(isTypeOutput.peerPackageDependencies).to.not.have.key('lodash.set');
      });
    });
    // TODO: implement once we can extend a specific env with new methods (to apply config changes)
    // and maybe to also apply custom compiler which add deps
    describe('policies added by an env', function () {
      let barFooOutput;
      before(() => {
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFooAsDir();
        // TODO: use custom env with versions provided from outside in the config by the user
        helper.extensions.addExtensionToVariant('bar', 'teambit.react/react', {});
        barFooOutput = helper.command.showComponentParsed('bar/foo');
      });
      it('should have the updated dependencies for bar/foo from the env', function () {
        expect(barFooOutput.peerPackageDependencies).to.have.property('react', '^16.8.0 || ^17.0.0');
        expect(barFooOutput.devPackageDependencies).to.have.property('@types/react', '^16.8.0');
      });
    });
    describe('policies added by extension', function () {
      const EXTENSIONS_BASE_FOLDER = 'extension-add-dependencies';
      const config = {};
      before(() => {
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFooAsDir();
        helper.fixtures.createComponentUtilsIsType();
        helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
        helper.command.addComponent('utils', { i: 'utils/is-type' });
      });

      describe('extension that add simple dependency policy', function () {
        let barFooOutput;
        let isTypeOutput;

        before(() => {
          helper.fixtures.copyFixtureExtensions(EXTENSIONS_BASE_FOLDER);
          helper.command.addComponent(EXTENSIONS_BASE_FOLDER);
          helper.npm.installNpmPackage('@teambit/harmony');
          helper.extensions.addExtensionToVariant('bar', 'my-scope/extension-add-dependencies', config);
          helper.extensions.addExtensionToVariant(EXTENSIONS_BASE_FOLDER, 'teambit.harmony/aspect');
          helper.command.install();
          helper.command.compile();
          barFooOutput = helper.command.showComponentParsed('bar/foo');
          isTypeOutput = helper.command.showComponentParsed('utils/is-type');
        });
        it('should have the updated dependencies for bar/foo', function () {
          expect(barFooOutput.packageDependencies).to.have.property('lodash.get', '4.0.0');
          expect(barFooOutput.devPackageDependencies).to.have.property('lodash.words', '4.0.0');
          expect(barFooOutput.peerPackageDependencies).to.have.property('lodash.set', '4.0.0');
        });
        it('should not put the dependencies for not configured component', function () {
          expect(isTypeOutput.packageDependencies).to.not.have.key('lodash.get');
          expect(isTypeOutput.devPackageDependencies).to.not.have.key('lodash.words');
          expect(isTypeOutput.peerPackageDependencies).to.not.have.key('lodash.set');
        });
      });
      describe.skip('conflict between few extensions policies', function () {
        it.skip('should merge them', function () {});
      });
      describe.skip('conflict between extension and user policies ', function () {
        it.skip('should prefer user config', function () {});
      });
    });
  });
  (supportNpmCiRegistryTesting ? describe : describe.skip)('saving dependencies package names', function () {
    let npmCiRegistry: NpmCiRegistry;
    let randomStr;
    before(async () => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();

      npmCiRegistry = new NpmCiRegistry(helper);
      randomStr = generateRandomStr(4); // to avoid publishing the same package every time the test is running
      const name = `react.${randomStr}.{name}`;
      npmCiRegistry.configureCustomNameInPackageJsonHarmony(name);
      helper.fixtures.populateComponents(4);

      await npmCiRegistry.init();

      helper.command.tagAllComponents();
    });
    after(() => {
      npmCiRegistry.destroy();
    });
    it('should save the packageName data into the dependencyResolver extension in the model', () => {
      const comp2 = helper.command.catComponent('comp2@latest');
      const depResolverExt = comp2.extensions.find((e) => e.name === Extensions.dependencyResolver);
      expect(depResolverExt).to.be.ok;
      expect(depResolverExt.data).to.have.property('dependencies');
      // One of the entries is @types/jest coming from the node env
      expect(depResolverExt.data.dependencies).to.have.lengthOf(2);
      expect(depResolverExt.data.dependencies[0].componentId.name).to.equal('comp3');
      expect(depResolverExt.data.dependencies[0].componentId.version).to.equal('0.0.1');
      expect(depResolverExt.data.dependencies[0].packageName).to.equal(`react.${randomStr}.comp3`);
    });
    describe('exporting the component', () => {
      before(() => {
        helper.command.export();
      });
      it('should change the component id to include the scope name', () => {
        const comp2 = helper.command.catComponent('comp2@latest');
        const depResolverExt = comp2.extensions.find((e) => e.name === Extensions.dependencyResolver);
        expect(depResolverExt.data.dependencies[0].componentId.scope).to.equal(helper.scopes.remote);
        expect(depResolverExt.data.dependencies[0].componentId.version).to.equal('0.0.1');
        expect(depResolverExt.data.dependencies[0].componentId.name).to.equal('comp3');
        expect(depResolverExt.data.dependencies[0].packageName).to.equal(`react.${randomStr}.comp3`);
      });
    });
  });
});
