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
  describe('workspace with a new compiler extension', () => {
    let scopeBeforeTag: string;
    before(async () => {
      helper.scopeHelper.initWorkspaceAndRemoteScope();

      const sourceDir = path.join(helper.fixtures.getFixturesDir(), 'components');
      const destination = path.join(helper.scopes.localPath, 'components');
      fs.copySync(path.join(sourceDir, 'help'), path.join(destination, 'help'));
      helper.command.addComponent('components/*');

      helper.fixtures.addExtensionGulpTS();

      const bitjsonc = helper.bitJsonc.read();
      bitjsonc.variants.help = {
        extensions: {
          [`${helper.scopes.remote}/extensions/gulp-ts`]: {},
          compile: {
            compiler: `@bit/${helper.scopes.remote}.extensions.gulp-ts:transpile`
          }
        }
      };
      helper.bitJsonc.write(bitjsonc);
      scopeBeforeTag = helper.scopeHelper.cloneLocalScope();
    });
    describe('compile from the cmd', () => {
      before(() => {
        helper.command.runCmd('bit compile');
      });
      it('should write dists files inside the capsule', () => {
        const helpCapsule = helper.command.getCapsuleOfComponent('help');
        expect(path.join(helpCapsule, 'dist')).to.be.a.directory();
        expect(path.join(helpCapsule, 'dist/help.js')).to.be.a.file();
      });
    });
    describe('tag the component', () => {
      before(() => {
        helper.command.tagComponent('help');
      });
      it('should save the dists in the objects', () => {
        const catHelp = helper.command.catComponent('help@latest');
        expect(catHelp).to.have.property('dists');
        const dists = catHelp.dists;
        const files = dists.map(d => d.relativePath);
        expect(files).to.include('help.js');
      });
      describe('export and import to another scope', () => {
        before(() => {
          helper.command.exportAllComponents();

          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
          helper.command.importComponent('help');
        });
        it('should import the extensions as well into the scope', () => {
          const scopeList = helper.command.listLocalScopeParsed('--scope');
          const ids = scopeList.map(entry => entry.id);
          expect(ids).to.include(`${helper.scopes.remote}/extensions/gulp-ts`);
        });
        it('should not show the component as modified', () => {
          helper.command.expectStatusToBeClean();
        });
        describe('running compile on the imported component', () => {
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
        output = helper.command.tagAllComponents();
      });
      // a guard for Flows bug that exits unexpectedly
      it('should be able to tag', () => {
        expect(output).to.have.string('2 component(s) tagged');
      });
      it('should still save the dists on the component with the compiler', () => {
        const catHelp = helper.command.catComponent('help@latest');
        expect(catHelp).to.have.property('dists');
        const dists = catHelp.dists;
        const files = dists.map(d => d.relativePath);
        expect(files).to.include('help.js');
      });
    });
  });
});
