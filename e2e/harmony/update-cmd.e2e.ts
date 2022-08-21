import { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
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
  describe('updates policies', function () {
    describe('policies added by the user', function () {
      let configFile;
      let componentJson;
      before(() => {
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.fixtures.populateComponents(2);
        helper.extensions.addExtensionToVariant('comp1', 'teambit.dependencies/dependency-resolver', {
          policy: {
            devDependencies: {
              'is-negative': '1.0.0',
            },
          },
        });
        helper.command.ejectConf('comp2/comp2');
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
        configFile = helper.bitJsonc.read(helper.scopes.localPath);
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
  });
  (supportNpmCiRegistryTesting ? describe.only : describe.skip)('updates dependencies from the model', () => {
    let configFile;
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.bitJsonc.setPackageManager(`teambit.dependencies/pnpm`);
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      helper.fixtures.populateComponents(1);
      helper.command.create('aspect', 'my-aspect', '--path=my-aspect');
      helper.fs.outputFile(`comp1/index.js`, `const isNegative = require("is-negative");`);
      helper.extensions.addExtensionToVariant('comp1', `${helper.scopes.remoteWithoutOwner}/my-aspect`, {});
      helper.command.install('is-negative@1.0.0');
      helper.command.compile();
      helper.command.tagAllComponents();
      helper.command.export();

      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.scopeHelper.addRemoteScope();
      helper.command.import(`${helper.scopes.remote}/my-aspect`);
      helper.command.tagComponent('my-aspect', undefined, '--unmodified');
      helper.command.export();

      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.extensions.bitJsonc.setPackageManager(`teambit.dependencies/pnpm`);
      helper.scopeHelper.addRemoteScope();
      helper.bitJsonc.setupDefault();
      helper.command.import(`${helper.scopes.remote}/comp1`);
      helper.command.update('--yes');
      configFile = helper.bitJsonc.read(helper.scopes.localPath);
    });
    it('should add an updated version of the dependency from the model to the workspace policies', function () {
      expect(configFile['teambit.dependencies/dependency-resolver'].policy.dependencies['is-negative']).to.equal(
        '2.1.0'
      );
    });
    it('should not update extensions from the model', function () {
      expect(
        configFile['teambit.dependencies/dependency-resolver'].policy.dependencies[
          `@${helper.scopes.remote.replace('.', '/')}.my-aspect`
        ]
      ).to.eq(undefined);
    });
    after(() => {
      npmCiRegistry.destroy();
    });
  });
});
