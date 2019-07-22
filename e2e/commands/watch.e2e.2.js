import { expect } from 'chai';
import Helper from '../e2e-helper';
import * as fixtures from '../fixtures/fixtures';

describe('bit watch command', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('watch', () => {
    let watchProcess;
    before(async () => {
      helper.setNewLocalAndRemoteScopes();
      helper.populateWorkspaceWithComponents();
      helper.importDummyCompiler();
      helper.build();
      watchProcess = await helper.watch();
    });
    after(() => {
      watchProcess.kill();
    });
    describe('changing a file', () => {
      before(() => {
        helper.createFile('utils', 'is-string.js', fixtures.isStringV2);
      });
      it('should update the dist', async () => {
        await helper.waitForWatchToRebuildComponent(watchProcess);
        const distContent = helper.readFile('dist/utils/is-string.js');
        expect(distContent).to.equal(fixtures.isStringV2);
      });
    });
  });
});
