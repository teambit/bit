import chai, { expect } from 'chai';
import path from 'path';
import fs from 'fs-extra';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('tasks/scripts functionality', function() {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe.only('running build task', () => {
    let taskOutput;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const sourceDir = path.join(helper.fixtures.getFixturesDir(), 'components');
      const extensionsDir = path.join(helper.fixtures.getFixturesDir(), 'extensions');
      const destination = path.join(helper.scopes.localPath, 'components');
      const extDestination = path.join(helper.scopes.localPath, 'extensions');
      fs.copySync(path.join(sourceDir, 'logo'), path.join(destination, 'logo'));
      fs.copySync(path.join(sourceDir, 'help'), path.join(destination, 'help'));
      fs.copySync(path.join(sourceDir, 'app'), path.join(destination, 'app'));
      fs.copySync(path.join(extensionsDir, 'gulp-ts'), path.join(extDestination, 'gulp-ts'));

      helper.command.addComponent('components/*');
      helper.command.addComponent('extensions/gulp-ts', { i: 'extensions/gulp-ts' });

      // helper.bitJson.addDefaultScope();
      const extensions = {
        scripts: {
          build: ['extensions/gulp-ts']
        },
        'extensions/gulp-ts': {},
        create: { template: 'extensions/gulp-ts' }
      };
      const overrides = {
        'extensions/*': {
          extensions: {
            pipes: {
              build: []
            }
          }
        }
      };
      helper.bitJson.addKeyVal(undefined, 'extensions', extensions);
      helper.bitJson.addOverrides(overrides);
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
      taskOutput = helper.command.runTask('build');
    });
    // @todo: improve!
    it.only('should do something useful', () => {
      expect(taskOutput).to.have.string("Got Message from ChildProcess { dir: 'dist' }");
    });
    // @todo: move it from here.
    describe('create', () => {
      before(() => {
        helper.command.create('foo');
      });
      it('should create the component files', () => {
        const compDir = path.join(helper.scopes.localPath, 'components/foo');
        expect(path.join(compDir, 'foo.js')).to.be.a.file();
        expect(path.join(compDir, 'foo.spec.js')).to.be.a.file();
      });
      it('should add the files to bitmap', () => {
        const status = helper.command.status();
        expect(status).to.have.string('foo');
      });
    });
  });
});
