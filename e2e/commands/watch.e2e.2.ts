import chai, { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { IS_WINDOWS } from '@teambit/legacy.constants';
import { Helper } from '@teambit/legacy.e2e-helper';
import WatchRunner from '../watch-runner';
import chaiFs from 'chai-fs';
chai.use(chaiFs);

// @TODO: fix for Windows
(IS_WINDOWS ? describe.skip : describe)('bit watch command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('Harmony watch, using Compiler & Typescript extensions', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponentsTS();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.extensions.addExtensionToVariant('*', 'teambit.harmony/node', {});
    });
    describe('run bit watch', () => {
      let watchRunner: WatchRunner;
      before(async () => {
        watchRunner = new WatchRunner(helper, true);
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
          const distContent = helper.fs.readFile(`node_modules/@${helper.scopes.remote}/comp1/dist/index.js`);
          expect(distContent).to.have.string('hello');
        });
      });
      describe('adding a new file to an existing component', () => {
        before(async () => {
          helper.fs.outputFile('comp1/index2.ts', 'console.log("hello")');
          await watchRunner.waitForWatchToRebuildComponent();
        });
        it('should write the dists on node_modules correctly', () => {
          const distContent = helper.fs.readFile(`node_modules/@${helper.scopes.remote}/comp1/dist/index2.js`);
          expect(distContent).to.have.string('hello');
        });
        it('should update the .bitmap file with the newly added file', () => {
          const files = helper.command.getComponentFiles('comp1');
          expect(files).to.have.lengthOf(2);
          expect(files).to.include('index2.ts');
        });
      });
      describe('adding a new component', () => {
        before(async () => {
          helper.fs.outputFile('comp4/index.ts', 'console.log("hello")');
          helper.command.addComponent('comp4');
          await watchRunner.waitForWatchToRebuildComponent();
        });
        it('should recognize the .bitmap changes and compile the newly added component', () => {
          const distContent = helper.fs.readFile(`node_modules/@${helper.scopes.remote}/comp4/dist/index.js`);
          expect(distContent).to.have.string('hello');
        });
        describe('changing this new component', () => {
          before(async () => {
            helper.fs.outputFile('comp4/index.ts', 'console.log("hello!")');
            helper.command.addComponent('comp4');
            await watchRunner.waitForWatchToRebuildComponent();
          });
          it('should watch this newly added component for changes', () => {
            const distContent = helper.fs.readFile(`node_modules/@${helper.scopes.remote}/comp4/dist/index.js`);
            expect(distContent).to.have.string('hello!');
          });
        });
      });
      describe('tagging the component', () => {
        before(async () => {
          helper.command.tagIncludeUnmodifiedWithoutBuild();
          helper.fs.appendFile('comp1/index.ts', '   ');
          await watchRunner.waitForWatchToRebuildComponent();
          helper.command.tagWithoutBuild('comp1', '--unmodified');

          // as an intermediate step, make sure it's 0.0.2
          const bitMap = helper.bitMap.read();
          expect(bitMap.comp1.version).to.equal('0.0.2');

          helper.fs.appendFile('comp1/index.ts', '   ');
          await watchRunner.waitForWatchToRebuildComponent();
        });
        // it used to load the previous component from the scope-cache and assume that comp1 has
        // only 0.0.1 and therefore change the .bitmap to 0.0.1
        it('editing the file, should not change the version to an older version', () => {
          const bitMap = helper.bitMap.read();
          expect(bitMap.comp1.version).to.equal('0.0.2');
        });
      });
    });
  });
  describe('scope file watching (.bit directory)', () => {
    let watchRunner: WatchRunner;
    let allOutput: string;
    before(async () => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponentsTS();
      helper.extensions.addExtensionToVariant('*', 'teambit.harmony/node', {});
      watchRunner = new WatchRunner(helper, true);
      await watchRunner.watch();
      allOutput = '';
      watchRunner.watchProcess.stdout!.on('data', (data: Buffer) => {
        allOutput += data.toString();
      });
    });
    after(() => {
      watchRunner.killWatcher();
    });
    it('should not trigger main watcher events for files inside .bit directory', async () => {
      // Write a file inside .bit (not in events dir) - main watcher should ignore it
      const testFile = path.join(helper.scopes.localPath, '.bit', 'test-ignore-file');
      fs.outputFileSync(testFile, 'test content');
      // Change a component file to verify the main watcher IS working
      helper.fs.outputFile('comp1/index.ts', 'console.log("scope-watch-test")');
      await watchRunner.waitForWatchToRebuildComponent();
      // The component file event should appear but .bit/test-ignore-file should not
      expect(allOutput).to.include('comp1/index.ts');
      expect(allOutput).to.not.include('test-ignore-file');
    });
    it('should detect IPC event files written to .bit/events/ via the scope watcher', async () => {
      allOutput = '';
      // Write an IPC event file (simulating what "bit install" does via publishIpcEvent)
      const eventsDir = path.join(helper.scopes.localPath, '.bit', 'events');
      fs.ensureDirSync(eventsDir);
      const ipcFile = path.join(eventsDir, 'onPostInstall');
      // Remove if leftover from workspace setup, then write fresh to trigger 'add' event
      fs.removeSync(ipcFile);
      fs.writeFileSync(ipcFile, 'test');
      // The scope watcher (chokidar with polling) should detect this and print it in verbose mode
      await watchRunner.waitForWatchToPrintMsg('onPostInstall', 15000);
    });
  });
});
