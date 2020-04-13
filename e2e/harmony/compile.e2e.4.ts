import path from 'path';
import fs from 'fs-extra';
import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

// @todo: this test is extremely similar to the flows.e2e one.
// refactor to extract the common code
describe('compile extension', function() {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('workspace with a new compiler extension', () => {
    before(async () => {
      helper.scopeHelper.initWorkspaceAndRemoteScope();

      const sourceDir = path.join(helper.fixtures.getFixturesDir(), 'components');
      const extensionsDir = path.join(helper.fixtures.getFixturesDir(), 'extensions');
      const destination = path.join(helper.scopes.localPath, 'components');
      const extDestination = path.join(helper.scopes.localPath, 'extensions');
      fs.copySync(path.join(sourceDir, 'help'), path.join(destination, 'help'));
      fs.copySync(path.join(extensionsDir, 'gulp-ts'), path.join(extDestination, 'gulp-ts'));

      helper.command.addComponent('components/*');
      helper.command.addComponent('extensions/gulp-ts', { i: 'extensions/gulp-ts' });

      const bitjsonc = helper.bitJsonc.read();
      bitjsonc.variants.help = {
        extensions: {
          [`${helper.scopes.remote}/extensions/gulp-ts`]: {},
          compile: {
            compiler: `#@bit/${helper.scopes.remote}.extensions.gulp-ts:transpile`
          }
        }
      };
      helper.bitJsonc.write(bitjsonc);

      helper.bitJsonc.addDefaultScope();

      helper.npm.initNpm();
      const dependencies = {
        gulp: '^4.0.2',
        'gulp-typescript': '^6.0.0-alpha.1',
        merge2: '^1.3.0',
        react: '^16.12.0',
        typescript: '^3.7.5'
      };
      const devDependencies = {
        '@types/react': '^16.9.17'
      };
      helper.packageJson.addKeyValue({ dependencies, devDependencies });
      helper.command.runCmd('npm i');

      helper.command.runCmd('bit link');

      // @todo: currently, the defaultScope is not enforced, so unless the extension is exported
      // first, the full-id won't be recognized when loading the extension.
      // once defaultScope is mandatory, make sure this is working without the next two lines
      helper.command.tagComponent('extensions/gulp-ts');
      helper.command.exportComponent('extensions/gulp-ts');
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
            const helpCapsule = helper.command.getCapsuleOfComponent('help@0.0.1');
            expect(path.join(helpCapsule, 'dist')).to.be.a.directory();
            expect(path.join(helpCapsule, 'dist/help.js')).to.be.a.file();
          });
        });
      });
    });
  });
});
