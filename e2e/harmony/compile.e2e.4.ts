import path from 'path';
import fs from 'fs-extra';
import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import { IS_WINDOWS } from '../../src/constants';

chai.use(require('chai-fs'));

(IS_WINDOWS ? describe.skip : describe)('compile extension', function() {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('workspace with a new compile extension', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let scopeBeforeTag: string;
    let appOutput: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.bitJsonc.addDefaultScope();
      appOutput = helper.fixtures.populateComponentsTS();
      const environments = {
        env: 'React',
        config: {}
      };
      helper.extensions.addExtensionToVariant('*', 'Environments', environments);
      scopeBeforeTag = helper.scopeHelper.cloneLocalScope();
    });
    describe('compile from the cmd (compilation for development)', () => {
      before(() => {
        helper.command.runCmd('bit compile');
      });
      it('should not create a capsule as it is not needed for development', () => {
        const capsulesJson = helper.command.runCmd('bit capsule-list -j');
        const capsules = JSON.parse(capsulesJson);
        capsules.capsules.forEach(c => expect(c).to.not.have.string('comp1'));
      });
      it('should write the dists files inside the node-modules of the component', () => {
        const nmComponent = path.join(
          helper.scopes.localPath,
          'node_modules/@bit',
          `${helper.scopes.remote}.comp1/dist`
        );
        expect(nmComponent).to.be.a.directory();
        expect(path.join(nmComponent, 'index.js')).to.be.a.file();
        expect(path.join(nmComponent, 'index.js.map')).to.be.a.file(); // should save source-map.
      });
      it('the app should work', () => {
        const result = helper.command.runCmd('node app.js');
        expect(result).to.have.string(appOutput);
      });
    });
    describe('tag the components (compilation for release)', () => {
      before(() => {
        helper.command.tagAllComponents();
      });
      it('should write dists files inside the capsule as it is needed for release', () => {
        const capsule = helper.command.getCapsuleOfComponent('comp1');
        expect(path.join(capsule, 'dist')).to.be.a.directory();
        expect(path.join(capsule, 'dist/index.js')).to.be.a.file();
      });
      it('should save the dists in the objects', () => {
        const catComp2 = helper.command.catComponent('comp2@latest');
        expect(catComp2).to.have.property('dists');
        const dists = catComp2.dists;
        const files = dists.map(d => d.relativePath);
        expect(files).to.include('index.js');
        expect(files).to.include('index.d.ts'); // makes sure it saves declaration files
      });
      describe('export and import to another scope', () => {
        before(() => {
          helper.command.exportAllComponents();

          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
          helper.command.importComponent('comp1');
        });
        it('should import the extensions as well into the scope', () => {
          const scopeList = helper.command.listLocalScopeParsed('--scope');
          const ids = scopeList.map(entry => entry.id);
          expect(ids).to.include(`${helper.scopes.remote}/extensions/typescript`);
        });
        it('should not show the component as modified', () => {
          helper.command.expectStatusToBeClean();
        });
        // @todo: fix!
        // it started breaking once the compiler extension instance was needed.
        // for imported components, the extension config is there but not the instance.
        describe.skip('running compile on the imported component', () => {
          before(() => {
            helper.command.runCmd('bit compile help');
          });
          it('should generate dists on the capsule', () => {
            const capsulePath = helper.command.getCapsuleOfComponent('help@0.0.1');
            expect(path.join(capsulePath, 'dist')).to.be.a.directory();
            expect(path.join(capsulePath, 'dist/help.js')).to.be.a.file();
          });
          it('should generate dists also after deleting the dists from the capsule', () => {
            const capsulePath = helper.command.getCapsuleOfComponent('help@0.0.1');
            fs.removeSync(path.join(capsulePath, 'dist'));
            helper.command.runCmd('bit compile help');
            expect(path.join(capsulePath, 'dist')).to.be.a.directory();
            expect(path.join(capsulePath, 'dist/help.js')).to.be.a.file();
          });
        });
      });
    });
    describe('add another component that does not need any compilation', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeBeforeTag);
        helper.fs.outputFile('bar/foo.js');
        helper.command.addComponent('bar');
        helper.bitJsonc.addToVariant(undefined, 'bar', 'extensions', {});
        output = helper.command.tagAllComponents();
      });
      // a guard for Flows bug that exits unexpectedly
      it('should be able to tag', () => {
        expect(output).to.have.string('4 component(s) tagged');
      });
      it('should still save the dists on the component with the compiler', () => {
        const catComp = helper.command.catComponent('comp3@latest');
        expect(catComp).to.have.property('dists');
        const dists = catComp.dists;
        const files = dists.map(d => d.relativePath);
        expect(files).to.include('index.js');
      });
    });
  });
});
