import { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

describe('update command', function () {
  let helper: Helper;
  this.timeout(0);
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('updates policies to latest versions', function () {
    describe('policies added by the user', function () {
      let configFile;
      let componentJson;
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fixtures.populateComponents(2);
        helper.extensions.addExtensionToVariant('comp1', 'teambit.dependencies/dependency-resolver', {
          policy: {
            devDependencies: {
              'is-negative': '1.0.0',
            },
          },
        });
        helper.command.ejectConf('comp2');
        componentJson = helper.componentJson.read('comp2');
        delete componentJson.componentId.scope;
        componentJson.extensions = {
          'teambit.dependencies/dependency-resolver': {
            policy: {
              peerDependencies: {
                'is-odd': '1.0.0',
              },
            },
          },
        };
        helper.componentJson.write(componentJson, 'comp2');
        helper.command.install('is-positive@1.0.0');
        helper.command.update('--yes');
        configFile = helper.workspaceJsonc.read(helper.scopes.localPath);
        componentJson = helper.componentJson.read('comp2');
      });
      it('should update the version range', function () {
        expect(configFile['teambit.dependencies/dependency-resolver'].policy.dependencies['is-positive']).not.to.equal(
          '1.0.0'
        );
      });
      it('should update the root dependency version in node_modules', function () {
        expect(helper.fixtures.fs.readJsonFile(`node_modules/is-positive/package.json`).version).not.to.equal('1.0.0');
      });
      it('should update the version range in the variant', function () {
        expect(
          // eslint-disable-next-line
          configFile['teambit.workspace/variants']['comp1']['teambit.dependencies/dependency-resolver'].policy
            .devDependencies['is-negative']
        ).not.to.equal('1.0.0');
      });
      it('should update the variant dependency in node_modules', function () {
        expect(helper.fixtures.fs.readJsonFile(`node_modules/is-negative/package.json`).version).not.to.equal('1.0.0');
      });
      it('should update the version range in component.json', function () {
        expect(
          componentJson.extensions['teambit.dependencies/dependency-resolver'].policy.peerDependencies['is-odd']
        ).not.to.equal('1.0.0');
      });
      it('should update the component dependency in node_modules', function () {
        expect(helper.fixtures.fs.readJsonFile(`node_modules/is-odd/package.json`).version).not.to.equal('1.0.0');
      });
    });
    describe('select by patterns', function () {
      let configFile;
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.extensions.workspaceJsonc.addPolicyToDependencyResolver({
          dependencies: {
            'is-odd': '1.0.0',
            'is-negative': '1.0.0',
            'is-positive': '1.0.0',
          },
        });
        helper.command.install();
        helper.command.update('--yes is-posit*');
        configFile = helper.workspaceJsonc.read(helper.scopes.localPath);
      });
      it('should update the version range of the selected package', function () {
        expect(configFile['teambit.dependencies/dependency-resolver'].policy.dependencies['is-positive']).not.to.equal(
          '1.0.0'
        );
      });
      it('should not update the version ranges of the packages that were not selected', function () {
        expect(configFile['teambit.dependencies/dependency-resolver'].policy.dependencies['is-negative']).to.equal(
          '1.0.0'
        );
        expect(configFile['teambit.dependencies/dependency-resolver'].policy.dependencies['is-odd']).to.equal('1.0.0');
      });
    });
    describe('policies added by deps set', function () {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fixtures.populateComponents(1);
        helper.command.dependenciesSet('comp1', 'is-negative@1.0.0');
        helper.command.update('--yes');
      });
      it('should update the version range', function () {
        const showOutput = helper.command.showComponentParsed('comp1');
        expect(showOutput.packageDependencies['is-negative']).not.to.equal('1.0.0');
      });
    });
  });
  describe('updates policies to compatible versions', function () {
    describe('policies added by deps set', function () {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fixtures.populateComponents(1);
        helper.command.dependenciesSet('comp1', 'is-negative@1.0.0');
        helper.command.update('--yes --semver');
      });
      it('should update the version range', function () {
        const showOutput = helper.command.showComponentParsed('comp1');
        expect(showOutput.packageDependencies['is-negative']).to.equal('1.0.1');
      });
    });
    describe('policies added by deps set. savePrefix is present', function () {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('savePrefix', '^');
        helper.fixtures.populateComponents(1);
        helper.command.dependenciesSet('comp1', 'is-negative@1.0.0');
        helper.command.update('--yes --semver');
      });
      it('should update the version range', function () {
        const showOutput = helper.command.showComponentParsed('comp1');
        expect(showOutput.packageDependencies['is-negative']).to.equal('^1.0.1');
      });
    });
  });
  (supportNpmCiRegistryTesting ? describe : describe.skip)('updates dependencies from the model', () => {
    let configFile;
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.workspaceJsonc.setPackageManager(`teambit.dependencies/pnpm`);
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      helper.fixtures.populateComponents(1);
      helper.command.create('bit-aspect', 'my-aspect', '--path=my-aspect');
      helper.fs.outputFile(
        `comp1/index.js`,
        `const isNegative = require("is-negative");
const isOdd = require("is-odd");
const isPositive = require("is-positive");`
      );
      helper.extensions.workspaceJsonc.addPolicyToDependencyResolver({
        dependencies: {
          'is-positive': '1.0.0',
        },
      });
      helper.extensions.addExtensionToVariant('comp1', `${helper.scopes.remote}/my-aspect`, {});
      helper.extensions.addExtensionToVariant('comp1', 'teambit.dependencies/dependency-resolver', {
        policy: {
          devDependencies: {
            'is-negative': '~1.0.0',
          },
          peerDependencies: {
            'is-odd': '1.0.0',
          },
        },
      });
      helper.command.install();
      helper.command.compile();
      helper.command.tagAllComponents();
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.import(`${helper.scopes.remote}/my-aspect`);
      helper.command.tagComponent('my-aspect', undefined, '--unmodified');
      helper.command.export();
    });
    after(() => {
      npmCiRegistry.destroy();
    });
    describe('with save prefix specified', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.extensions.workspaceJsonc.setPackageManager(`teambit.dependencies/pnpm`);
        helper.scopeHelper.addRemoteScope();
        helper.workspaceJsonc.setupDefault();
        helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('savePrefix', '^');
        helper.command.import(`${helper.scopes.remote}/comp1`);
        helper.command.update('--yes');
        configFile = helper.workspaceJsonc.read(helper.scopes.localPath);
      });
      it('should add an updated version of the dependency from the model to the workspace policies', function () {
        expect(configFile['teambit.dependencies/dependency-resolver'].policy.dependencies['is-positive']).to.equal(
          '^3.1.0'
        );
      });
      it('should add an updated version of the dependency from the model to the bitmap', function () {
        const bitMap = helper.bitMap.read();
        expect(
          bitMap.comp1.config['teambit.dependencies/dependency-resolver'].policy.dependencies['is-negative']
        ).to.equal('^2.1.0');
      });
      it('should not update extensions from the model', function () {
        expect(
          configFile['teambit.dependencies/dependency-resolver'].policy.dependencies[
            `@${helper.scopes.remote.replace('.', '/')}.my-aspect`
          ]
        ).to.eq(undefined);
      });
      it('should not update peer dependencies from the model', function () {
        expect(configFile['teambit.dependencies/dependency-resolver'].policy.dependencies['is-odd']).to.eq(undefined);
        expect(configFile['teambit.dependencies/dependency-resolver'].policy.peerDependencies['is-odd']).to.eq(
          undefined
        );
      });
    });
    describe('with save prefix not specified', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.extensions.workspaceJsonc.setPackageManager(`teambit.dependencies/pnpm`);
        helper.scopeHelper.addRemoteScope();
        helper.workspaceJsonc.setupDefault();
        helper.command.import(`${helper.scopes.remote}/comp1`);
        helper.command.update('--yes');
        configFile = helper.workspaceJsonc.read(helper.scopes.localPath);
      });
      it('should add an updated version of the dependency from the model to the bitmap', function () {
        const bitMap = helper.bitMap.read();
        expect(
          bitMap.comp1.config['teambit.dependencies/dependency-resolver'].policy.dependencies['is-negative']
        ).to.equal('~2.1.0');
      });
      it('should not update extensions from the model', function () {
        expect(
          configFile['teambit.dependencies/dependency-resolver'].policy.dependencies[
            `@${helper.scopes.remote.replace('.', '/')}.my-aspect`
          ]
        ).to.eq(undefined);
      });
      it('should not update peer dependencies from the model', function () {
        expect(configFile['teambit.dependencies/dependency-resolver'].policy.dependencies['is-odd']).to.eq(undefined);
        expect(configFile['teambit.dependencies/dependency-resolver'].policy.peerDependencies['is-odd']).to.eq(
          undefined
        );
      });
    });
  });
  (supportNpmCiRegistryTesting ? describe : describe.skip)('updates auto-detected dependencies from the model', () => {
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.workspaceJsonc.setPackageManager(`teambit.dependencies/pnpm`);
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      helper.fixtures.populateComponents(2);
      helper.command.install();
      helper.command.compile();
      helper.command.tagAllComponents();
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.import(`${helper.scopes.remote}/comp2`);
      helper.command.tagAllComponents('--unmodified');
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.import(`${helper.scopes.remote}/comp1`);
      helper.command.update('--yes');
    });
    after(() => {
      npmCiRegistry.destroy();
    });
    it('should update dependency', function () {
      const showOutput = helper.command.showComponentParsed('comp1');
      expect(showOutput.dependencies[0].id).to.equal(`${helper.scopes.remote}/comp2@0.0.2`);
    });
  });
  (supportNpmCiRegistryTesting ? describe : describe.skip)('dependency in the model is also a local component', () => {
    let configFile;
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.workspaceJsonc.setPackageManager(`teambit.dependencies/pnpm`);
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      helper.fixtures.populateComponents(1);
      helper.command.install();
      helper.command.compile();
      helper.command.tagAllComponents();
      helper.command.export();

      helper.command.tagAllComponents('--unmodified');
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.fs.outputFile(
        `comp1new/index.js`,
        `const comp1 = require("@ci/${helper.scopes.remoteWithoutOwner}.comp1");`
      );
      helper.command.addComponent('comp1new');
      helper.workspaceJsonc.addKeyValToDependencyResolver('policy', {
        dependencies: {
          [`@ci/${helper.scopes.remoteWithoutOwner}.comp1`]: '0.0.1',
        },
      });
      helper.command.install();
      helper.command.compile();
      helper.command.tagAllComponents();
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.import(`${helper.scopes.remote}/comp1@0.0.1`);
      helper.command.import(`${helper.scopes.remote}/comp1new@0.0.1`);
      helper.command.update('--yes');
      configFile = helper.workspaceJsonc.read(helper.scopes.localPath);
    });
    after(() => {
      npmCiRegistry.destroy();
    });
    it('should not update component that is available locally in the workspace', function () {
      expect(
        configFile['teambit.dependencies/dependency-resolver'].policy.dependencies[
          `@ci/${helper.scopes.remoteWithoutOwner}.comp1`
        ]
      ).to.equal(undefined);
    });
  });
});
