import chai, { expect } from 'chai';
import path from 'path';
import fs from 'fs-extra';
import Helper from '../e2e-helper';

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('bit build', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('importing and using compiler', () => {
    beforeEach(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
    });
    it('Should not be able to build without importing a build env', () => {
      const output = helper.build();
      expect(output).to.have.string('nothing to build');
    });
    it('Should successfully import and build using the babel compiler', () => {
      const output = helper.importCompiler();
      expect(output).to.have.string(
        `the following component environments were installed\n- ${helper.envScope}/compilers/babel@`
      );
      const buildOutput = helper.build();
      expect(buildOutput).to.have.string(path.normalize('local/dist/bar/foo.js.map'));
      expect(buildOutput).to.have.string(path.normalize('local/dist/bar/foo.js'));
    });
  });
  describe('with dist attribute populated', () => {
    let localConsumerFiles;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.importCompiler();
      helper.createComponent(path.normalize('src/bar'), 'foo.js');
      helper.addComponent(path.normalize('src/bar/foo.js'));
    });
    describe('as author', () => {
      describe('with dist.entry populated', () => {
        before(() => {
          helper.modifyFieldInBitJson('dist', { entry: 'src' });
          helper.build();
          localConsumerFiles = helper.getConsumerFiles('*.{js,ts}', false);
        });
        after(() => {
          fs.removeSync(path.join(helper.localScopePath, 'dist'));
        });
        it('should write the dists files without the dist.entry part', () => {
          expect(localConsumerFiles).to.include(path.join('dist', 'bar', 'foo.js'));
          expect(localConsumerFiles).to.not.include(path.join('dist', 'src', 'bar', 'foo.js'));
        });
      });
      describe('with dist.entry and dist.target populated', () => {
        before(() => {
          helper.modifyFieldInBitJson('dist', { entry: 'src', target: 'my-dist' });
          helper.build();
          localConsumerFiles = helper.getConsumerFiles('*.{js,ts}', false);
        });
        after(() => {
          fs.removeSync(path.join(helper.localScopePath, 'my-dist'));
        });
        it('should write the dists files inside dist.target dir and without the dist.entry part', () => {
          expect(localConsumerFiles).to.include(path.join('my-dist', 'bar', 'foo.js'));
          expect(localConsumerFiles).to.not.include(path.join('my-dist', 'src', 'bar', 'foo.js'));
          expect(localConsumerFiles).to.not.include(path.join('dist', 'src', 'bar', 'foo.js'));
          expect(localConsumerFiles).to.not.include(path.join('dist', 'bar', 'foo.js'));
        });
      });
    });
    describe('as imported', () => {
      before(() => {
        helper.commitAllComponents();
        helper.exportAllComponents();
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/foo');
      });
      describe('with dist.entry populated', () => {
        before(() => {
          helper.modifyFieldInBitJson('dist', { entry: 'src' });
          helper.build('bar/foo');
          localConsumerFiles = helper.getConsumerFiles('*.{js,ts}', false);
        });
        after(() => {
          fs.removeSync(path.join(helper.localScopePath, 'dist'));
        });
        it('should write the dists files without the dist.entry part and without the originallySharedDirectory part', () => {
          expect(localConsumerFiles).to.include(path.join('dist', 'components', 'bar', 'foo', 'foo.js'));
          expect(localConsumerFiles).to.not.include(path.join('dist', 'components', 'bar', 'foo', 'src', 'foo.js')); // dist.entry
          expect(localConsumerFiles).to.not.include(path.join('dist', 'components', 'bar', 'foo', 'bar', 'foo.js')); // originallyShared
          expect(localConsumerFiles).to.not.include(
            path.join('dist', 'components', 'bar', 'foo', 'bar', 'src', 'foo.js')
          ); // both
        });
      });
      describe('with dist.entry and dist.target populated', () => {
        before(() => {
          helper.modifyFieldInBitJson('dist', { entry: 'src', target: 'my-dist' });
          helper.build('bar/foo');
          localConsumerFiles = helper.getConsumerFiles('*.{js,ts}', false);
        });
        after(() => {
          fs.removeSync(path.join(helper.localScopePath, 'my-dist'));
        });
        it('should write the dists files inside dist.target dir and without the dist.entry part', () => {
          expect(localConsumerFiles).to.include(path.join('my-dist', 'components', 'bar', 'foo', 'foo.js'));
          expect(localConsumerFiles).to.not.include(path.join('dist', 'components', 'bar', 'foo', 'foo.js')); // default dist.target
          expect(localConsumerFiles).to.not.include(path.join('my-dist', 'components', 'bar', 'foo', 'src', 'foo.js')); // dist.entry
          expect(localConsumerFiles).to.not.include(path.join('my-dist', 'components', 'bar', 'foo', 'bar', 'foo.js')); // originallyShared
          expect(localConsumerFiles).to.not.include(
            path.join('my-dist', 'components', 'bar', 'foo', 'bar', 'src', 'foo.js')
          ); // both
        });
      });
    });
  });
});
