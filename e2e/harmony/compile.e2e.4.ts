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
  describe('compile from the cmd', () => {
    before(async () => {
      helper.scopeHelper.initWorkspace();

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
          'extensions/gulp-ts': {},
          compile: {
            compiler: '#@bit/extensions.gulp-ts:transpile'
          }
        }
      };
      helper.bitJsonc.write(bitjsonc);

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
      helper.command.runCmd('bit compile');
    });
    it('should write dists files', () => {
      const helpCapsule = helper.command.getCapsuleOfComponent('help');
      expect(path.join(helpCapsule, 'dist')).to.be.a.directory();
      expect(path.join(helpCapsule, 'dist/help.js')).to.be.a.file();
    });
  });
});
