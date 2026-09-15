/* eslint-disable max-lines */
import chai, { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';
import { OutsideWorkspaceError } from '@teambit/workspace';
import { statusInvalidComponentsMsg } from '@teambit/legacy.constants';
import { MainFileIsDir, PathOutsideConsumer, VersionShouldBeRemoved } from '@teambit/tracker';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
import assertArrays from 'chai-arrays';
chai.use(chaiFs);

chai.use(assertArrays);

describe('bit add command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('add before running "bit init"', () => {
    it('Should return message to run "bit init"', () => {
      helper.fixtures.createComponentBarFoo();
      const cmd = () => helper.fixtures.addComponentBarFoo();
      const error = new OutsideWorkspaceError();
      helper.general.expectToThrow(cmd, error);
    });
  });
  describe('bit add without bitmap and .git/bit initialized', () => {
    it('Should find local scope inside .git/bit and add component', () => {
      helper.scopeHelper.reInitWorkspace();
      helper.git.initNewGitRepo();
      helper.bitMap.delete();
      helper.fs.deletePath('.bit');
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      helper.command.init();
      helper.fixtures.createComponentBarFoo();
      const addCmd = () => helper.fixtures.addComponentBarFoo();
      expect(addCmd).to.not.throw();
    });
  });
  describe('add one component', () => {
    let output;
    beforeEach(() => {
      helper.scopeHelper.reInitWorkspace();
    });
    it('Should print tracking component: id', () => {
      helper.fixtures.createComponentBarFoo();
      output = helper.fixtures.addComponentBarFoo();
      expect(output).to.contain('bar/foo');
    });
    it('Should print warning when trying to add file that is already tracked with different id and not add it as a new one', () => {
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      output = helper.command.addComponent('bar -i bar/new');
      expect(output).to.have.string(`files bar/foo.js already used by component: ${helper.scopes.remote}/bar/foo`);
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.not.have.property('bar/new');
    });
    it('Should add component with namespace flag to bitmap with correct name', () => {
      helper.fs.createFile('bar', 'foo2.js');
      helper.command.addComponent('bar', { n: 'test' });
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('test/bar');
    });
    it('Should throw error msg if -i and -n flag are used with bit add', () => {
      helper.fs.createFile('bar', 'foo2.js');
      const addCmd = () => helper.command.addComponent('bar', { n: 'test', i: 'jaja' });
      expect(addCmd).to.throw('please use either [id] or [namespace] to add a particular component');
    });
    it('Define dynamic main file ', () => {
      const mainFileOs = path.normalize('{PARENT}/{PARENT}.js');
      helper.fs.createFile('bar', 'bar.js');
      helper.fs.createFile('bar', 'foo1.js');
      helper.command.addComponent('bar', { m: mainFileOs, n: 'test' });
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('test/bar');
      const mainFile = bitMap['test/bar'].mainFile;
      expect(mainFile).to.equal('bar.js');
    });
    it('should add component with id contains only one level', () => {
      helper.fs.createFile('bar', 'foo.js');
      helper.command.addComponent('bar', {
        i: 'foo',
      });
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('foo');
    });
  });
  describe('add component/s with gitignore', () => {
    let errorMessage;
    before(() => {
      helper.scopeHelper.reInitWorkspace();
    });
    it('Should show warning msg in case there are no files to add because of gitignore', () => {
      helper.fs.createFile('bar', 'foo2.js');
      helper.git.writeGitIgnore(['bar/foo2.js']);
      try {
        helper.command.addComponent(path.normalize('bar'), { i: 'bar/foo2' });
      } catch (err: any) {
        errorMessage = err.message;
      }
      expect(errorMessage).to.contain(
        `warning: no files to add, the following files were ignored: ${path.normalize('bar/foo2.js')}`
      );
    });
  });
  describe('ignore specific files inside component', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fs.createFile('bar', 'foo.js');
      helper.fs.createFile('bar', 'foo3.js');
      helper.fs.createFile('bar', 'boo.js');
      helper.fs.createFile('bar', 'index.js');
      helper.git.writeGitIgnore(['bar/foo.js', 'bar/foo3.js']);
      helper.command.addComponent(path.normalize('bar'), { i: 'bar/foo' });
    });
    it('Should contain inside bitmap only files that are not inside gitignore', () => {
      const files = helper.command.getComponentFiles('bar/foo');
      expect(files).to.include('boo.js');
      expect(files).to.include('index.js');
      expect(files).to.be.ofSize(2);
    });
  });
  describe('add component when id includes a version', () => {
    before(() => {
      helper.command.init();
      helper.fixtures.createComponentBarFoo();
    });
    it('should throw an VersionShouldBeRemoved exception', () => {
      const addFunc = () => helper.command.addComponent('bar', { i: 'bar/foo@0.0.4' });
      const error = new VersionShouldBeRemoved('bar/foo@0.0.4');
      helper.general.expectToThrow(addFunc, error);
    });
  });
  describe('add component when the main file is a directory', () => {
    before(() => {
      helper.command.init();
      helper.fixtures.createComponentBarFoo();
      helper.fs.createFile('mainDir', 'mainFile.js');
    });
    it('should throw an exception MainFileIsDir', () => {
      const addFunc = () => helper.command.addComponent('bar', { i: 'bar/foo', m: 'mainDir' });
      const mainPath = path.join(helper.scopes.localPath, 'mainDir');
      const error = new MainFileIsDir(mainPath);
      helper.general.expectToThrow(addFunc, error);
    });
  });
  describe('add the main file when it was removed before', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fs.createFile('bar', 'foo.js');
      helper.fs.createFile('bar', 'foo-main.js');
      helper.command.addComponent('bar', { m: 'foo-main.js', i: 'bar/foo' });
      helper.fs.deletePath('bar/foo-main.js');
      const status = helper.command.status();
      expect(status).to.have.string(statusInvalidComponentsMsg);
      expect(status).to.have.string('main-file was removed');
      helper.fs.createFile('bar', 'foo-main2.js');
      output = helper.command.addComponent('bar', { m: 'bar/foo-main2.js', i: 'bar/foo' });
    });
    it('should add the main file successfully', () => {
      expect(output).to.have.string('added foo-main2.js');
    });
  });
  describe('directory is with upper case and test/main flags are written with lower case', () => {
    let addOutput;
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fs.createFile('Bar', 'foo.js');
      addOutput = helper.general.runWithTryCatch('bit add Bar -i bar -m bar/foo.js');
    });
    it('should throw an error for case sensitive filesystem saying the file was not found. for other system, it should work', () => {
      if (addOutput.includes('error')) {
        expect(addOutput).to.have.string('does not contain a main file');
      } else {
        expect(addOutput).to.have.string('added');

        const files = helper.command.getComponentFiles('bar');
        expect(files).to.include('foo.js');

        const bitMap = helper.bitMap.read();
        expect(bitMap).to.have.property('bar');
        expect(bitMap.bar.rootDir).to.equal('Bar');
      }
    });
  });
  describe('adding a directory outside the consumer dir', () => {
    let consumerDir;
    before(() => {
      helper.scopeHelper.clean();
      consumerDir = path.join(helper.scopes.localPath, 'bar');
      fs.mkdirSync(consumerDir);
      helper.fs.createFile('foo', 'foo.js');
      helper.command.init(consumerDir);
    });
    it('should throw PathOutsideConsumer error', () => {
      const addCmd = () => helper.command.addComponent('../foo', undefined, consumerDir);
      const error = new PathOutsideConsumer(path.normalize('../foo'));
      helper.general.expectToThrow(addCmd, error);
    });
  });
});
