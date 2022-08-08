import { expect } from 'chai';
import fs from 'fs-extra';
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
      helper.fs.outputFile(`comp1/index.js`, `const comp3 = require("${scope}comp3");`);
      helper.fs.outputFile(`comp2/index.js`, `const comp3 = require("${scope}comp3");`);
      helper.command.install();
      helper.command.compile();
      helper.command.tagComponent('comp3 comp1');
      helper.command.export();
      helper.command.removeComponent('comp1');
      helper.command.tagComponent('comp3 comp2', undefined, '--unmodified');
      helper.command.export();

      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.extensions.bitJsonc.setPackageManager(`teambit.dependencies/pnpm`);
      helper.scopeHelper.addRemoteScope();
      helper.bitJsonc.setupDefault();
      helper.command.import(`${helper.scopes.remote}/comp1`);
      helper.command.import(`${helper.scopes.remote}/comp2`);
    });
    it('should install dependencies from their respective models to the imported components', () => {
      expect(helper.fs.readJsonFile(`node_modules/${scope}comp3/package.json`).version).to.eq('0.0.1');
      expect(
        helper.fs.readJsonFile(
          path.join(helper.scopes.remoteWithoutOwner, `comp2/node_modules/${scope}comp3/package.json`)
        ).version
      ).to.eq('0.0.2');
    });
    after(() => {
      npmCiRegistry.destroy();
    });
  }
);
