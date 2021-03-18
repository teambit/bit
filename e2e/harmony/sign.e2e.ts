import chai, { expect } from 'chai';
import { HARMONY_FEATURE, BUILD_ON_CI } from '../../src/api/consumer/lib/feature-toggle';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('sign command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures([HARMONY_FEATURE, BUILD_ON_CI]);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('simple case with one scope', () => {
    let signOutput: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.exportAllComponents();
      // yes, this is strange, it adds the remote-scope to itself as a remote. we need it because
      // we run "action" command from the remote to itself to clear the cache. (needed because
      // normally bit-sign is running from the fs but a different http service is running as well)
      helper.scopeHelper.addRemoteScope(undefined, helper.scopes.remotePath);
      signOutput = helper.command.sign(
        [`${helper.scopes.remote}/comp1`, `${helper.scopes.remote}/comp2`],
        '',
        helper.scopes.remotePath
      );
    });
    it('on the workspace, the build status should be pending', () => {
      const comp1 = helper.command.catComponent(`${helper.scopes.remote}/comp1@latest`);
      expect(comp1.buildStatus).to.equal('pending');
    });
    it('should sign successfully', () => {
      expect(signOutput).to.include('the following 2 component(s) were signed with build-status "succeed"');
    });
    it('should save updated versions on the remotes', () => {
      const comp1 = helper.command.catComponent(`${helper.scopes.remote}/comp1@latest`, helper.scopes.remotePath);
      expect(comp1.buildStatus).to.equal('succeed');
    });
    // @todo: fix it as soon as possible
    describe.skip('running bit import on the workspace', () => {
      before(() => {
        helper.command.importAllComponents();
      });
      it('should bring the updated Version from the remote', () => {
        const comp1 = helper.command.catComponent(`${helper.scopes.remote}/comp1@latest`);
        expect(comp1.buildStatus).to.equal('succeed');
      });
    });
  });
  describe.skip('circular dependencies between two scopes', () => {
    let signOutput: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      const secondRemote = helper.scopeHelper.getNewBareScope();
      helper.scopeHelper.addRemoteScope(secondRemote.scopePath);
      helper.scopeHelper.addRemoteScope(secondRemote.scopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, secondRemote.scopePath);
      helper.fs.outputFile('comp1/index.js', `require('@${secondRemote.scopeName}/comp2');`);
      helper.fs.outputFile('comp2/index.js', `require('@${helper.scopes.remote}/comp1');`);
      helper.command.addComponent('comp1');
      helper.command.addComponent('comp2');
      helper.bitJsonc.addToVariant('comp2', 'defaultScope', secondRemote.scopeName);
      helper.command.linkAndCompile();
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      const signRemote = helper.scopeHelper.getNewBareScope('-remote-sign');
      helper.scopeHelper.addRemoteScope(secondRemote.scopePath, signRemote.scopePath);
      signOutput = helper.command.sign(
        [`${helper.scopes.remote}/comp1`, `${secondRemote.scopeName}/comp2`],
        '--multiple',
        signRemote.scopePath
      );
    });
    it('on the workspace, the build status should be pending', () => {
      const comp1 = helper.command.catComponent(`${helper.scopes.remote}/comp1@latest`);
      expect(comp1.buildStatus).to.equal('pending');
    });
    it('should sign successfully', () => {
      expect(signOutput).to.include('the following 2 component(s) were signed with build-status "succeed"');
    });
    it('should save updated versions on the remotes', () => {
      const comp1 = helper.command.catComponent(`${helper.scopes.remote}/comp1@latest`, helper.scopes.remotePath);
      expect(comp1.buildStatus).to.equal('succeed');
    });
  });
});
