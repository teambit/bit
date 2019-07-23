import chai, { expect } from 'chai';
import path from 'path';
import Helper from '../e2e-helper';
import * as fixtures from '../fixtures/fixtures';
import WatchRunner from '../watch-runner';

chai.use(require('chai-fs'));

describe('bit watch command', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('watch', () => {
    let scopeAfterBuild;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.populateWorkspaceWithComponents();
      helper.importDummyCompiler();
      helper.build();
      scopeAfterBuild = helper.cloneLocalScope();
    });
    describe('as author', () => {
      let watchRunner;
      before(async () => {
        watchRunner = new WatchRunner(helper);
        await watchRunner.watch();
      });
      after(() => {
        watchRunner.killWatcher();
      });
      describe('changing a file', () => {
        before(() => {
          helper.createFile('utils', 'is-string.js', fixtures.isStringV2);
        });
        it('should update the dist', async () => {
          await watchRunner.waitForWatchToRebuildComponent();
          const distContent = helper.readFile('dist/utils/is-string.js');
          expect(distContent).to.equal(fixtures.isStringV2);
        });
        describe('changing it again', () => {
          before(() => {
            helper.createFile('utils', 'is-string.js', fixtures.isStringV3);
          });
          it('should update the dist again', async () => {
            await watchRunner.waitForWatchToRebuildComponent();
            const distContent = helper.readFile('dist/utils/is-string.js');
            expect(distContent).to.equal(fixtures.isStringV3);
          });
        });
      });
    });
    describe('as imported', () => {
      let watchRunner;
      before(async () => {
        helper.getClonedLocalScope(scopeAfterBuild);
        helper.tagAllComponents();
        helper.exportAllComponents();
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.addRemoteEnvironment();
        helper.importManyComponents(['bar/foo', 'utils/is-string', 'utils/is-type']);
        watchRunner = new WatchRunner(helper);
        await watchRunner.watch();
      });
      after(() => {
        watchRunner.killWatcher();
      });
      describe('adding a file to a tracked directory', () => {
        before(() => {
          helper.outputFile('components/utils/is-string/new-file.js', 'console.log();');
        });
        it('should create a dist file for that new file', async () => {
          await watchRunner.waitForWatchToRebuildComponent();
          const expectedFile = path.join(helper.localScopePath, 'components/utils/is-string/dist/new-file.js');
          expect(expectedFile).to.be.a.file();
        });
      });
    });
  });
});
