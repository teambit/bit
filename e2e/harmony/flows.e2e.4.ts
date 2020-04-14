import path from 'path';
import fs from 'fs-extra';
import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('flows functionality', function() {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('running build task', () => {
    let taskOutput;
    before(() => {
      helper.scopeHelper.initWorkspaceAndRemoteScope();

      const sourceDir = path.join(helper.fixtures.getFixturesDir(), 'components');
      const destination = path.join(helper.scopes.localPath, 'components');
      fs.copySync(path.join(sourceDir, 'logo'), path.join(destination, 'logo'));
      fs.copySync(path.join(sourceDir, 'help'), path.join(destination, 'help'));
      fs.copySync(path.join(sourceDir, 'app'), path.join(destination, 'app'));
      helper.command.addComponent('components/*');

      helper.fixtures.addExtensionGulpTS();
      const bitjsonc = helper.bitJsonc.read();
      bitjsonc.variants.help = {
        extensions: {
          [`${helper.scopes.remote}/extensions/gulp-ts`]: {},
          flows: {
            tasks: {
              build: [`#@bit/${helper.scopes.remote}.extensions.gulp-ts:transpile`]
            }
          }
        }
      };
      helper.bitJsonc.write(bitjsonc);

      taskOutput = helper.command.runTask('build help');
    });
    it('should output results', () => {
      expect(taskOutput).to.have.string('Hello Report!');
    });
    it('should write dists files', () => {
      const helpCapsule = helper.command.getCapsuleOfComponent('help');
      expect(path.join(helpCapsule, 'dist')).to.be.a.directory();
      expect(path.join(helpCapsule, 'dist/help.js')).to.be.a.file();
    });
    describe('imported component', () => {
      before(() => {
        helper.command.tagComponent('help');
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
          helper.command.runTask('build help');
        });
        it('should generate dists on the capsule', () => {
          const capsulePath = helper.command.getCapsuleOfComponent('help@0.0.1');
          expect(path.join(capsulePath, 'dist')).to.be.a.directory();
          expect(path.join(capsulePath, 'dist/help.js')).to.be.a.file();
        });
        it('should generate dists also after deleting the dists from the capsule', () => {
          const capsulePath = helper.command.getCapsuleOfComponent('help@0.0.1');
          fs.removeSync(path.join(capsulePath, 'dist'));
          helper.command.runTask('build help --no-cache');
          expect(path.join(capsulePath, 'dist')).to.be.a.directory();
          expect(path.join(capsulePath, 'dist/help.js')).to.be.a.file();
        });
      });
    });
  });
});
