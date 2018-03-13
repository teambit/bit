import chai, { expect } from 'chai';
import path from 'path';
import Helper from '../e2e-helper';

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('bit build', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('as author', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
    });
    it('should not be able to build without importing a build env', () => {
      const output = helper.build();
      expect(output).to.have.string('nothing to build');
    });
    describe('after importing a compiler', () => {
      before(() => {
        const output = helper.importCompiler();
        expect(output).to.have.string(
          `the following component environments were installed\n- ${helper.envScope}/compilers/babel@`
        );
      });
      it('should successfully import and build using the babel compiler', () => {
        const buildOutput = helper.build();
        expect(buildOutput).to.have.string(path.normalize('local/dist/bar/foo.js.map'));
        expect(buildOutput).to.have.string(path.normalize('local/dist/bar/foo.js'));
      });
      describe('as imported', () => {
        let localScope;
        before(() => {
          helper.tagAllWithoutMessage();
          helper.exportAllComponents();
          helper.reInitLocalScope();
          helper.addRemoteScope();
          helper.addRemoteEnvironment();
          helper.importComponent('bar/foo');
          helper.createFile('components/bar/foo', 'foo.js', 'console.log("got foo")');
          localScope = helper.cloneLocalScope();
        });
        describe('build without --verbose flag', () => {
          let buildOutput;
          before(() => {
            buildOutput = helper.build();
          });
          it('should not show npm output', () => {
            expect(buildOutput).to.not.have.string('npm');
          });
          it('should indicate that compiler was installed', () => {
            expect(buildOutput).to.have.string('successfully installed the');
            expect(buildOutput).to.have.string('compiler');
          });
        });
        describe('build with --verbose flag', () => {
          let buildOutput;
          before(() => {
            helper.getClonedLocalScope(localScope);
            buildOutput = helper.build('--verbose');
          });
          it('should show npm output', () => {
            expect(buildOutput).to.have.string('npm WARN');
            expect(buildOutput).to.have.string('successfully ran npm install at');
          });
          it('should indicate that compiler was installed', () => {
            expect(buildOutput).to.have.string('successfully installed the');
            expect(buildOutput).to.have.string('compiler');
          });
        });
      });
    });
  });
});
