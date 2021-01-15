import chai, { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import Helper from '../../src/e2e-helper/e2e-helper';
import { DEFAULT_OWNER } from '../../src/e2e-helper/e2e-scopes';

chai.use(require('chai-fs'));

/**
 * @todo: test the following cases
 * 1. delete the package of the deleted component and make sure it's possible to import it (maybe with a flag of disable-npm-install)
 * 2. the entire scope of flattened-dependency is down. make sure that it fetches the component from cache of direct.
 */
describe('recovery after component/scope deletion', function () {
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
  describe('scope of dependency is down', () => {
    let depRemote;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      depRemote = scopeName;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.fs.outputFile('dep/dep.js', `console.log("I am just dep");`);
      helper.fs.outputFile('main/main.js', `require('@${scopeName}/dep');`);
      helper.command.addComponent('dep');
      helper.command.addComponent('main');
      helper.bitJsonc.addToVariant('dep', 'defaultScope', depRemote);
      helper.command.linkAndRewire();
      helper.command.compile();
      helper.command.tagAllComponents();
      helper.command.export();

      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.scopeHelper.addRemoteScope();
      fs.removeSync(scopePath);
      helper.command.importComponent('main');
    });
    it('should', () => {});
  });
  describe('scope of dependency of dependency is down', () => {
    let depRemote;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      depRemote = scopeName;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.fs.outputFile('dep/dep.js', `console.log("I am just dep");`);
      helper.fs.outputFile('middle/middle.js', `require('@${scopeName}/dep');`);
      helper.fs.outputFile('main/main.js', `require('@${helper.scopes.remote}/middle');`);
      helper.command.addComponent('dep');
      helper.command.addComponent('middle');
      helper.command.addComponent('main');
      helper.bitJsonc.addToVariant('dep', 'defaultScope', depRemote);
      helper.command.linkAndRewire();
      helper.command.compile();
      helper.command.tagAllComponents();
      helper.command.export();

      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.scopeHelper.addRemoteScope();
      fs.removeSync(scopePath);
      helper.command.importComponent('main');
    });
    it('should', () => {});
  });
  (supportNpmCiRegistryTesting ? describe : describe.skip)('workspace with TS components', () => {
    let scopeWithoutOwner: string;
    let secondRemotePath: string;
    let secondRemoteName: string;
    let secondScopeBeforeUpdate: string;
    before(async () => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      scopeWithoutOwner = helper.scopes.remoteWithoutOwner;
      npmCiRegistry = new NpmCiRegistry(helper);
      npmCiRegistry.configureCiInPackageJsonHarmony();
      await npmCiRegistry.init();
      const secondRemote = helper.scopeHelper.getNewBareScope(undefined, true);
      secondRemotePath = secondRemote.scopePath;
      secondRemoteName = secondRemote.scopeName;
      helper.scopeHelper.addRemoteScope(secondRemote.scopePath);
      helper.fs.outputFile('comp1/index.js', `require('@${DEFAULT_OWNER}/${scopeWithoutOwner}.comp2');`);
      helper.fs.outputFile('comp2/index.js', `require('@${DEFAULT_OWNER}/${secondRemote.scopeWithoutOwner}.comp3');`);
      helper.fs.outputFile('comp3/index.js', '');
      helper.command.addComponent('comp1');
      helper.command.addComponent('comp2');
      helper.command.addComponent('comp3');
      helper.bitJsonc.addToVariant('comp3', 'defaultScope', secondRemoteName);
      helper.command.linkAndCompile();
      helper.command.tagAllComponents();
      helper.command.export();
      helper.scopeHelper.reInitRemoteScope(secondRemotePath);
    });
    after(() => {
      npmCiRegistry.destroy();
    });
    describe('indirect dependency is missing', () => {
      let scopeWithMissingDep: string;
      before(() => {
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.scopeHelper.addRemoteScope(secondRemotePath);
        npmCiRegistry.setResolver();
        helper.command.importComponent('comp1');
        // delete the comp3 from the scope.
        const hashPath = helper.general.getHashPathOfComponent('comp3');
        fs.removeSync(path.join(helper.scopes.localPath, '.bit/objects', hashPath));
        fs.removeSync(path.join(helper.scopes.localPath, '.bit/index.json'));
        scopeWithMissingDep = helper.scopeHelper.cloneLocalScope();
      });
      it('an intermediate check. the scope should not have the comp3 object', () => {
        const scope = helper.command.catScope(true);
        const comp3 = scope.find((item) => item.name === 'comp3');
        expect(comp3).to.be.undefined;
      });
      describe('the indirect dependency exists as cache inside the dependent scope', () => {
        describe('bit tag', () => {
          let tagOutput;
          before(() => {
            tagOutput = helper.command.tagWithoutBuild('comp1', '--force');
          });
          it('should succeed', () => {
            expect(tagOutput).to.have.string('1 component(s) tagged');
          });
          it('should bring the missing dep from the dependent', () => {
            const scope = helper.command.catScope(true);
            const comp3 = scope.find((item) => item.name === 'comp3');
            expect(comp3).to.not.be.undefined;
          });
        });
        describe('bit import', () => {
          before(() => {
            helper.scopeHelper.getClonedLocalScope(scopeWithMissingDep);
            helper.command.importAllComponents();
          });
          it('should bring the missing dep from the dependent', () => {
            const scope = helper.command.catScope(true);
            const comp3 = scope.find((item) => item.name === 'comp3');
            expect(comp3).to.not.be.undefined;
          });
        });
      });
      describe('the indirect dependency is missing in the dependent scope as well', () => {
        before(() => {
          // delete the comp3 from the remote scope.
          const hashPath = helper.general.getHashPathOfComponent('comp3', helper.scopes.remotePath);
          fs.removeSync(path.join(helper.scopes.remotePath, 'objects', hashPath));
          fs.removeSync(path.join(helper.scopes.remotePath, 'index.json'));
          helper.scopeHelper.addRemoteScope(secondRemotePath, helper.scopes.remotePath);
        });
        it('an intermediate check. the scope should not have the comp3 object', () => {
          const scope = helper.command.catScope(true, helper.scopes.remotePath);
          const comp3 = scope.find((item) => item.name === 'comp3');
          expect(comp3).to.be.undefined;
        });
        describe('bit import', () => {
          before(() => {
            helper.scopeHelper.getClonedLocalScope(scopeWithMissingDep);
            helper.command.importAllComponents();
          });
          it('should not throw an error and not bring the missing dep', () => {
            const scope = helper.command.catScope(true);
            const comp3 = scope.find((item) => item.name === 'comp3');
            expect(comp3).to.be.undefined;
          });
        });
        describe('bit tag', () => {
          it('should throw an error about missing dependencies', () => {
            expect(() => helper.command.tagWithoutBuild('comp1', '--force')).to.throw(
              'has the following dependencies missing'
            );
          });
        });
      });
    });
  });
});
