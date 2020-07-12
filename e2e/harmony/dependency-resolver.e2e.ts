import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import * as fixtures from '../../src/fixtures/fixtures';
import { Extensions } from '../../src/constants';

chai.use(require('chai-fs'));

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('dependency-resolver extension', function() {
  let helper: Helper;
  this.timeout(0);
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(HARMONY_FEATURE);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('policies changes', function() {
    describe('policies added by the user', function() {
      let barFooOutput;
      let isTypeOutput;

      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFooAsDir();
        helper.fixtures.createComponentUtilsIsType();
        helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
        helper.command.addComponent('utils', { i: 'utils/is-type' });
        const depResolverConfig = {
          policy: {
            dependencies: {
              'lodash.get': '1.0.0'
            },
            devDependencies: {
              'lodash.words': '1.0.0'
            },
            peerDependencies: {
              'lodash.set': '1.0.0'
            }
          }
        };
        helper.extensions.addExtensionToVariant('bar/foo', '@teambit/dependency-resolver', depResolverConfig);
        barFooOutput = helper.command.showComponentParsed('bar/foo');
        isTypeOutput = helper.command.showComponentParsed('utils/is-type');
      });
      it('should have the updated dependencies for bar/foo', function() {
        expect(barFooOutput.packageDependencies).to.have.property('lodash.get', '1.0.0');
        expect(barFooOutput.devPackageDependencies).to.have.property('lodash.words', '1.0.0');
        expect(barFooOutput.peerPackageDependencies).to.have.property('lodash.set', '1.0.0');
      });
      it('should have the updated dependencies for utils/is-type', function() {
        expect(isTypeOutput.packageDependencies).to.be.empty;
        expect(isTypeOutput.devPackageDependencies).to.be.empty;
        expect(isTypeOutput.peerPackageDependencies).to.be.empty;
      });
    });
    // TODO: implement once we can extend a specific env with new methods (to apply config changes)
    // and maybe to also apply custom compiler which add deps
    describe('policies added by an env', function() {
      let barFooOutput;
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFooAsDir();
        // TODO: use custom env with versions provided from outside in the config by the user
        helper.extensions.addExtensionToVariant('bar/foo', '@teambit/envs', {
          env: '@teambit/react',
          config: {}
        });
        barFooOutput = helper.command.showComponentParsed('bar/foo');
      });
      it('should have the updated dependencies for bar/foo from the env', function() {
        expect(barFooOutput.peerPackageDependencies).to.have.property('react', '^16.12.0');
        expect(barFooOutput.devPackageDependencies).to.have.property('@types/react', '^16.9.17');
      });
    });
    describe('policies added by extension', function() {
      const EXTENSIONS_BASE_FOLDER = 'extension-add-dependencies';
      const config = {};
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFooAsDir();
        helper.fixtures.createComponentUtilsIsType();
        helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
        helper.command.addComponent('utils', { i: 'utils/is-type' });
      });

      describe('extension that add simple dependency policy', function() {
        let barFooOutput;
        let isTypeOutput;

        before(() => {
          helper.fixtures.copyFixtureExtensions(EXTENSIONS_BASE_FOLDER);
          helper.command.addComponent(EXTENSIONS_BASE_FOLDER);
          helper.extensions.addExtensionToVariant('bar/foo', 'my-scope/extension-add-dependencies', config);
          barFooOutput = helper.command.showComponentParsed('bar/foo');
          isTypeOutput = helper.command.showComponentParsed('utils/is-type');
        });
        it('should have the updated dependencies for bar/foo', function() {
          expect(barFooOutput.packageDependencies).to.have.property('lodash.get', '1.0.0');
          expect(barFooOutput.devPackageDependencies).to.have.property('lodash.words', '1.0.0');
          expect(barFooOutput.peerPackageDependencies).to.have.property('lodash.set', '1.0.0');
        });
        it('should have the updated dependencies for utils/is-type', function() {
          expect(isTypeOutput.packageDependencies).to.be.empty;
          expect(isTypeOutput.devPackageDependencies).to.be.empty;
          expect(isTypeOutput.peerPackageDependencies).to.be.empty;
        });
      });
      describe.skip('conflict between few extensions policies', function() {
        it.skip('should merge them', function() {});
      });
      describe.skip('conflict between extension and user policies ', function() {
        it.skip('should prefer user config', function() {});
      });
    });
  });
  // @todo: once extensions are loaded on imported components, make sure the following:
  // import and validated that package.json has correct pkg names.
  describe('saving dependencies package names', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.fixtures.populateComponents(4);
      const name = `ui.{name}`;
      const pkg = {
        packageJson: {
          name
        }
      };
      helper.bitJsonc.addToVariant(undefined, '*', Extensions.pkg, pkg);
      helper.bitJsonc.addDefaultScope();
      // @todo: this is a hack, we need to figure out how to get this ext to auto-load for all components
      helper.bitJsonc.addToVariant(undefined, '*', Extensions.dependencyResolver, {});
      helper.command.linkAndRewire();
      helper.command.tagAllComponents();
    });
    it('should save the packageName data into the dependencyResolver extension in the model', () => {
      const comp2 = helper.command.catComponent('comp2@latest');
      const depResolverExt = comp2.extensions.find(e => e.name === Extensions.dependencyResolver);
      expect(depResolverExt).to.be.ok;
      expect(depResolverExt.data).to.have.property('dependencies');
      expect(depResolverExt.data.dependencies).to.have.lengthOf(1);
      expect(depResolverExt.data.dependencies[0].componentId.name).to.equal('comp3');
      expect(depResolverExt.data.dependencies[0].componentId.version).to.equal('0.0.1');
      expect(depResolverExt.data.dependencies[0].packageName).to.equal('ui.comp3');
    });
    describe('exporting the component', () => {
      before(() => {
        helper.command.exportAllComponents();
      });
      it('should change the component id to include the scope name', () => {
        const comp2 = helper.command.catComponent('comp2@latest');
        const depResolverExt = comp2.extensions.find(e => e.name === Extensions.dependencyResolver);
        expect(depResolverExt.data.dependencies[0].componentId.scope).to.equal(helper.scopes.remote);
        expect(depResolverExt.data.dependencies[0].componentId.version).to.equal('0.0.1');
        expect(depResolverExt.data.dependencies[0].componentId.name).to.equal('comp3');
        expect(depResolverExt.data.dependencies[0].packageName).to.equal('ui.comp3');
      });
    });
  });
});
