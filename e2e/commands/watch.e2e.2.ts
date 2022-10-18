import chai, { expect } from 'chai';
import { IS_WINDOWS } from '../../src/constants';
import Helper from '../../src/e2e-helper/e2e-helper';
import WatchRunner from '../watch-runner';

chai.use(require('chai-fs'));

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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponentsTS();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
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
          helper.command.tagWithoutBuild('comp1', '--force');

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
});
