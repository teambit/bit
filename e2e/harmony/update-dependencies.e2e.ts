import chai, { expect } from 'chai';

import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import Helper from '../../src/e2e-helper/e2e-helper';
import { DEFAULT_OWNER } from '../../src/e2e-helper/e2e-scopes';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

chai.use(require('chai-fs'));

describe('update-dependencies command', function () {
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
  (supportNpmCiRegistryTesting ? describe : describe.skip)('workspace with TS components', () => {
    let scopeWithoutOwner: string;
    let secondRemotePath: string;
    let secondRemoteName: string;
    let secondScopeBeforeUpdate: string;
    before(async () => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.addDefaultScope();
      helper.bitJsonc.disablePreview();
      scopeWithoutOwner = helper.scopes.remoteWithoutOwner;
      helper.fixtures.populateComponents(1);
      npmCiRegistry = new NpmCiRegistry(helper);
      helper.scopeHelper.reInitRemoteScope();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      await npmCiRegistry.init();
      helper.command.tagAllComponents();
      const secondRemote = helper.scopeHelper.getNewBareScope();
      secondRemotePath = secondRemote.scopePath;
      secondRemoteName = secondRemote.scopeName;
      helper.scopeHelper.addRemoteScope(secondRemote.scopePath);
      helper.fs.outputFile('comp-b/index.js', `require('@${DEFAULT_OWNER}/${scopeWithoutOwner}.comp1');`);
      helper.command.addComponent('comp-b');
      helper.bitJsonc.addToVariant('comp-b', 'defaultScope', secondRemote.scopeName);
      helper.command.tagAllComponents();
      helper.command.export();
      helper.fixtures.populateComponents(1, undefined, ' v2');
      helper.command.tagComponent('comp1', undefined, '1.0.5 --skip-auto-tag');
      helper.fixtures.populateComponents(1, undefined, ' v3');
      helper.command.tagComponent('comp1', undefined, '1.1.0 --skip-auto-tag');
      helper.command.export();
      secondScopeBeforeUpdate = helper.scopeHelper.cloneScope(secondRemotePath);
    });
    after(() => {
      npmCiRegistry.destroy();
    });
    describe('running from the remote scope', () => {
      let updateDepsOutput: string;
      before(() => {
        // yes, this is strange, it adds the remote-scope to itself as a remote. we need it because
        // we run "action" command from the remote to itself to clear the cache. (needed because
        // normally update-dependencies is running from the fs but a different http service is running as well)
        helper.scopeHelper.addRemoteScope(secondRemotePath, secondRemotePath);
        const data = [
          {
            componentId: `${secondRemoteName}/comp-b`,
            dependencies: [`${DEFAULT_OWNER}.${scopeWithoutOwner}/comp1@~1.0.0`],
          },
        ];
        updateDepsOutput = helper.command.updateDependencies(data, '--tag', secondRemotePath);
      });
      it('should succeed', () => {
        expect(updateDepsOutput).to.have.string('the following 1 component(s) were updated');
      });
      it('should tag the component with the updated version', () => {
        const compB = helper.command.catComponent(`${secondRemoteName}/comp-b@0.0.2`, secondRemotePath);
        expect(compB.dependencies[0].id.version).to.equal('1.0.5');
      });
    });
    describe('running from a new bare scope', () => {
      let updateDepsOutput: string;
      before(() => {
        helper.scopeHelper.getClonedScope(secondScopeBeforeUpdate, secondRemotePath);
        const updateRemote = helper.scopeHelper.getNewBareScope('-remote-update');
        helper.scopeHelper.addRemoteScope(secondRemotePath, updateRemote.scopePath);
        const data = [
          {
            componentId: `${secondRemoteName}/comp-b`,
            dependencies: [`${DEFAULT_OWNER}.${scopeWithoutOwner}/comp1@^1.0.0`],
            versionToTag: '3.0.0',
          },
        ];
        updateDepsOutput = helper.command.updateDependencies(data, '--tag --multiple', updateRemote.scopePath);
      });
      it('should succeed', () => {
        expect(updateDepsOutput).to.have.string('the following 1 component(s) were updated');
      });
      it('should tag the component with the updated version', () => {
        const compB = helper.command.catComponent(`${secondRemoteName}/comp-b@3.0.0`, secondRemotePath);
        expect(compB.dependencies[0].id.version).to.equal('1.1.0');
      });
    });
    describe('running from a new bare scope using --snap flag', () => {
      let updateDepsOutput: string;
      before(() => {
        helper.scopeHelper.getClonedScope(secondScopeBeforeUpdate, secondRemotePath);
        const updateRemote = helper.scopeHelper.getNewBareScope('-remote-update');
        helper.scopeHelper.addRemoteScope(secondRemotePath, updateRemote.scopePath);
        const data = [
          {
            componentId: `${secondRemoteName}/comp-b`,
            dependencies: [`${DEFAULT_OWNER}.${scopeWithoutOwner}/comp1@^1.0.0`],
          },
        ];
        updateDepsOutput = helper.command.updateDependencies(data, '--snap --multiple', updateRemote.scopePath);
      });
      it('should succeed', () => {
        expect(updateDepsOutput).to.have.string('the following 1 component(s) were updated');
      });
      it('should not tag', () => {
        const compB = helper.command.catComponent(`${secondRemoteName}/comp-b`, secondRemotePath);
        expect(Object.keys(compB.versions)).to.have.lengthOf(1);
      });
      it('should snap the component with the updated version', () => {
        const compB = helper.command.catComponent(`${secondRemoteName}/comp-b@latest`, secondRemotePath);
        expect(compB.dependencies[0].id.version).to.equal('1.1.0');
      });
    });
  });
});
