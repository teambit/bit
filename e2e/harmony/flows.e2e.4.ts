import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

// Skip temporarily until we make it work
describe.skip('flows functionality', function() {
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
      helper.scopeHelper.initWorkspace();
      helper.fixtures.copyFixtureExtensions('gulp-ts');
      helper.command.addComponent('gulp-ts');
      helper.extensions.addExtensionToWorkspace('gulp-ts', {});
      helper.extensions.addExtensionToWorkspace('flows', { build: ['#@bit/extensions.gulp-ts:transpile'] });
      helper.fixtures.createComponentBarFoo('const a = 5');
      helper.fixtures.addComponentBarFoo();

      helper.npm.initNpm();
      // helper.npm.installNpmPackage('gulp', '^4.0.2');
      // helper.npm.installNpmPackage('gulp-typescript', '^6.0.0-alpha.1');
      // helper.npm.installNpmPackage('merge2', '^1.3.0');
      // helper.npm.installNpmPackage('react', '^16.12.0');
      // helper.npm.installNpmPackage('typescript', '^3.7.5');
      // helper.npm.installNpmPackage('@types/react', '^16.9.17');
      // helper.command.runCmd('bit link');
      taskOutput = helper.command.runTask('build');
    });
    // @todo: improve!
    it('should do something useful', () => {
      expect(taskOutput).to.have.string('result');
    });
  });
});
