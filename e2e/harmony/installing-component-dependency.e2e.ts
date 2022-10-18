import { expect } from 'chai';
import path from 'path';
import { Extensions } from '../../src/constants';
import Helper from '../../src/e2e-helper/e2e-helper';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

(supportNpmCiRegistryTesting ? describe : describe.skip)('installing a component dependency', function () {
  this.timeout(0);
  let scope: string;
  let helper: Helper;
  let npmCiRegistry: NpmCiRegistry;
  before(async () => {
    helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
    helper.scopeHelper.setNewLocalAndRemoteScopes();
    helper.bitJsonc.setupDefault();
    helper.bitJsonc.setPackageManager(`teambit.dependencies/pnpm`);
    npmCiRegistry = new NpmCiRegistry(helper);
    await npmCiRegistry.init();
    npmCiRegistry.configureCiInPackageJsonHarmony();
    helper.fixtures.populateComponents(2);
    scope = `@${helper.scopes.remote.replace('.', '/')}.`;
    helper.fs.outputFile(`comp1/index.js`, `const comp2 = require("${scope}comp2");`);
    helper.command.install();
    helper.command.compile();
    helper.command.tagComponent('comp2 comp1');
    helper.command.export();
    helper.command.removeComponent('comp1');
    helper.command.tagComponent('comp2', undefined, '--unmodified');
    helper.command.export();

    helper.scopeHelper.reInitLocalScope();
    helper.extensions.bitJsonc.setPackageManager(`teambit.dependencies/pnpm`);
    helper.scopeHelper.addRemoteScope();
    helper.bitJsonc.setupDefault();
    helper.command.import(`${helper.scopes.remote}/comp1`);
  });
  it('should install the version of the component dependency from the model, when it is not in the workspace policies', () => {
    expect(helper.fs.readJsonFile(`node_modules/${scope}comp2/package.json`).version).to.eq('0.0.1');
  });
  it('should not install the version of the component dependency from the model, when the component dependency is in the workspace policies', () => {
    helper.command.install(`${scope}comp2@0.0.2`);
    expect(helper.fs.readJsonFile(`node_modules/${scope}comp2/package.json`).version).to.eq('0.0.2');
    expect(
      helper.fs.exists(path.join(helper.scopes.remoteWithoutOwner, `comp1/node_modules/${scope}comp2/package.json`))
    ).to.eq(false);
  });
  it('should not install the version of the component dependency from the model, when the component dependency is in the bitmap config', () => {
    helper.command.dependenciesSet('comp1', `${scope}comp2@0.0.2`);
    helper.command.install();
    expect(helper.fs.readJsonFile(`node_modules/${scope}comp2/package.json`).version).to.eq('0.0.2');
    const show = helper.command.showAspectConfig('comp1', Extensions.dependencyResolver);
    const ids: string[] = show.data.dependencies.map((dep) => dep.id);
    const comp2 = ids.find((id) => id.includes('comp2'));
    expect(comp2?.endsWith('0.0.2')).to.be.true;
  });
  after(() => {
    npmCiRegistry.destroy();
  });
});
