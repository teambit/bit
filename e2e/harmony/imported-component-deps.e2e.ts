import { expect } from 'chai';
import path from 'path';
import Helper from '../../src/e2e-helper/e2e-helper';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

(supportNpmCiRegistryTesting ? describe : describe.skip)(
  'installing the right versions of dependencies of a new imported component',
  function () {
    this.timeout(0);
    let scope: string;
    let helper: Helper;
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.bitJsonc.setPackageManager(`teambit.dependencies/pnpm`);
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      helper.fixtures.populateComponents(3);
      scope = `@${helper.scopes.remote.replace('.', '/')}.`;
      const code = `const comp3 = require("${scope}comp3");
const isPositive = require('is-positive');
`;
      helper.fs.outputFile(`comp1/index.js`, code);
      helper.fs.outputFile(`comp2/index.js`, code);
      helper.command.install('is-positive@1.0.0');
      helper.command.compile();
      helper.command.tagComponent('comp3 comp1');
      helper.command.export();
      helper.command.removeComponent('comp1');
      helper.command.install('is-positive@2.0.0 --update-existing');
      helper.command.tagComponent('comp3 comp2', undefined, '--unmodified');
      helper.command.export();

      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.extensions.bitJsonc.setPackageManager(`teambit.dependencies/pnpm`);
      helper.scopeHelper.addRemoteScope();
      helper.bitJsonc.setupDefault();
      helper.command.import(`${helper.scopes.remote}/comp1`);
      helper.command.import(`${helper.scopes.remote}/comp2`);
    });
    it('should install component dependencies from their respective models to the imported components', () => {
      expect(helper.fs.readJsonFile(`node_modules/${scope}comp3/package.json`).version).to.eq('0.0.1');
      expect(
        helper.fs.readJsonFile(
          path.join(helper.scopes.remoteWithoutOwner, `comp2/node_modules/${scope}comp3/package.json`)
        ).version
      ).to.eq('0.0.2');
    });
    it('should install package dependencies from their respective models to the imported components', () => {
      expect(helper.fs.readJsonFile(`node_modules/is-positive/package.json`).version).to.eq('1.0.0');
      expect(
        helper.fs.readJsonFile(
          path.join(helper.scopes.remoteWithoutOwner, `comp2/node_modules/is-positive/package.json`)
        ).version
      ).to.eq('2.0.0');
    });
    after(() => {
      npmCiRegistry.destroy();
    });
  }
);

(supportNpmCiRegistryTesting ? describe : describe.skip)(
  'importing a component that has peer a peer dependency',
  function () {
    this.timeout(0);
    let helper: Helper;
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.bitJsonc.setPackageManager(`teambit.dependencies/pnpm`);
      helper.bitJsonc.addKeyValToDependencyResolver('policy', {
        peerDependencies: {
          'is-positive': '1.0.0',
        },
      });
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile(`comp1/index.js`, `const isPositive = require('is-positive');`);
      helper.command.install();
      helper.command.compile();
      helper.command.tagAllComponents();
      helper.command.export();

      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.extensions.bitJsonc.setPackageManager(`teambit.dependencies/pnpm`);
      helper.scopeHelper.addRemoteScope();
      helper.bitJsonc.setupDefault();
      helper.command.import(`${helper.scopes.remote}/comp1`);
    });
    it('should install component dependencies from their respective models to the imported components', () => {
      expect(() => helper.command.diff()).to.throw('there are no modified components to diff');
    });
    after(() => {
      npmCiRegistry.destroy();
    });
  }
);
