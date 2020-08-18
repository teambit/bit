import chai, { expect } from 'chai';
import * as path from 'path';
import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';
import WatchRunner from '../watch-runner';
import { IS_WINDOWS } from '../../src/constants';
import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';

chai.use(require('chai-fs'));

describe('bit watch command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('watch', () => {
    let scopeAfterBuild;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithThreeComponents();
      helper.env.importDummyCompiler();
      helper.command.build();
      scopeAfterBuild = helper.scopeHelper.cloneLocalScope();
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
          helper.fs.createFile('utils', 'is-string.js', fixtures.isStringV2);
        });
        it('should update the dist', async () => {
          await watchRunner.waitForWatchToRebuildComponent();
          const distContent = helper.fs.readFile('dist/utils/is-string.js');
          expect(distContent).to.equal(fixtures.isStringV2);
        });
        describe('changing it again', () => {
          before(() => {
            helper.fs.createFile('utils', 'is-string.js', fixtures.isStringV3);
          });
          it('should update the dist again', async () => {
            await watchRunner.waitForWatchToRebuildComponent();
            const distContent = helper.fs.readFile('dist/utils/is-string.js');
            expect(distContent).to.equal(fixtures.isStringV3);
          });
        });
      });
    });
    describe('as imported', function () {
      if (IS_WINDOWS || process.env.APPVEYOR === 'True') {
        // these tests are flaky on AppVeyor, they randomly get timeout from the watcher
        // @ts-ignore
        this.skip;
      } else {
        let watchRunner;
        before(async () => {
          helper.scopeHelper.getClonedLocalScope(scopeAfterBuild);
          helper.command.tagAllComponents();
          helper.command.exportAllComponents();
          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
          helper.scopeHelper.addRemoteEnvironment();
          helper.command.importManyComponents(['bar/foo', 'utils/is-string', 'utils/is-type']);
          helper.command.build('--no-cache'); // it'll also install the compiler
          watchRunner = new WatchRunner(helper);
          await watchRunner.watch();
        });
        after(() => {
          watchRunner.killWatcher();
        });
        describe('adding a file to a tracked directory', () => {
          before(async () => {
            helper.fs.outputFile('components/utils/is-string/new-file.js', 'console.log();');
            await watchRunner.waitForWatchToRebuildComponent();
          });
          it('should create a dist file for that new file', () => {
            const expectedFile = path.join(helper.scopes.localPath, 'components/utils/is-string/dist/new-file.js');
            expect(expectedFile).to.be.a.file();
          });
          describe('changing the new file', () => {
            it('should rebuild the changed component', async () => {
              helper.fs.outputFile('components/utils/is-string/new-file.js', 'console.log("v2");');
              await watchRunner.waitForWatchToPrintMsg('utils/is-string');
            });
          });
          describe('remove a file from the tracked directory', () => {
            it('should recognize the deletion and rebuild the component that had that file', async () => {
              helper.fs.deletePath('components/utils/is-string/new-file.js');
              await watchRunner.waitForWatchToPrintMsg('utils/is-string');
            });
          });
        });
      }
    });
  });
  describe('Harmony watch, using Compiler & Typescript extensions', () => {
    before(() => {
      helper.command.resetFeatures();
      helper.command.setFeatures(HARMONY_FEATURE);
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponentsTS();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.extensions.addExtensionToVariant('*', '@teambit/react', {});
    });
    describe('run bit watch', () => {
      let watchRunner: WatchRunner;
      before(async () => {
        watchRunner = new WatchRunner(helper);
        await watchRunner.watch();
      });
      after(() => {
        watchRunner.killWatcher();
      });
      describe('changing a file', () => {
        before(async () => {
          helper.fs.outputFile('comp1/index.ts', 'console.log("hello")');
          await watchRunner.waitForWatchToRebuildComponent();
        });
        it('should write the dists on node_modules correctly', () => {
          const distContent = helper.fs.readFile('node_modules/@my-scope/comp1/dist/index.js');
          expect(distContent).to.have.string('hello');
        });
      });
    });
  });
});
