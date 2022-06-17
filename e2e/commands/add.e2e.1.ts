/* eslint-disable max-lines */
import chai, { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';

import { InvalidName } from '@teambit/legacy-bit-id';
import { statusInvalidComponentsMsg } from '../../src/constants';
import { MissingMainFile } from '../../src/consumer/bit-map/exceptions';
import {
  MainFileIsDir,
  PathOutsideConsumer,
  VersionShouldBeRemoved,
} from '../../src/consumer/component-ops/add-components/exceptions';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

const assertArrays = require('chai-arrays');

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
      let error;
      try {
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFooAsDir();
      } catch (err: any) {
        error = err.message;
      }
      expect(error).to.have.string('workspace not found. to initiate a new workspace, please use `bit init');
    });
  });
  describe('bit add without bitmap and .git/bit initialized', () => {
    it('Should find local scope inside .git/bit and add component', () => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.git.initNewGitRepo();
      helper.bitMap.delete();
      helper.fs.deletePath('.bit');
      helper.fs.deletePath('bit.json');
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      helper.scopeHelper.initLocalScope();
      helper.fixtures.createComponentBarFoo();
      const addCmd = () => helper.fixtures.addComponentBarFooAsDir();
      expect(addCmd).to.not.throw();
    });
  });
  describe('add before running "bit init" with .bit.map.json', () => {
    it('Should init consumer add then add component', () => {
      helper.bitMap.create();
      helper.fixtures.createComponentBarFoo();
      const output = helper.fixtures.addComponentBarFoo();
      expect(output).to.contain('tracking component bar/foo');
    });
  });
  describe('add one component', () => {
    let output;
    beforeEach(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
    });
    it('Should print tracking component: id', () => {
      helper.fixtures.createComponentBarFoo();
      output = helper.fixtures.addComponentBarFoo();
      expect(output).to.contain('tracking component bar/foo');
    });
    it('Should print warning when trying to add file that is already tracked with different id and not add it as a new one', () => {
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      output = helper.command.addComponent('bar/foo.js -i bar/new');
      expect(output).to.have.string('warning: files bar/foo.js already used by component: bar/foo');
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.not.have.property('bar/new');
    });
    it('Should not add component if bit.json is corrupted', () => {
      helper.fs.createFile('bar', 'foo2.js');
      helper.bitJson.corrupt();
      try {
        helper.command.addComponent('bar');
      } catch (err: any) {
        output = err.toString();
      }
      expect(output).to.include('error: invalid bit.json: ');
      expect(output).to.include(`${path.join(helper.scopes.localPath, 'bit.json')}`);
    });
    it('Should add component with namespace flag to bitmap with correct name', () => {
      helper.fs.createFile('bar', 'foo2.js');
      helper.command.addComponent('bar', { n: 'test' });
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('test/foo2');
    });
    it('Should throw error when no index file is found', () => {
      const file1 = 'foo1.js';
      const file2 = 'foo2.js';
      helper.fs.createFile('bar', file1);
      helper.fs.createFile('bar', file2);

      const addCmd = () => helper.command.addComponent('bar', { n: 'test' });
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const error = new MissingMainFile('test/bar');
      helper.general.expectToThrow(addCmd, error);
    });
    it('Should throw error msg if -i and -n flag are used with bit add', () => {
      helper.fs.createFile('bar', 'foo2.js');
      const addCmd = () => helper.command.addComponent('bar', { n: 'test', i: 'jaja' });
      expect(addCmd).to.throw('please use either [id] or [namespace] to add a particular component');
    });
    it('Should prevent adding a file with invalid keys in namespace', () => {
      const error = new InvalidName('bar.f/foo');
      helper.fixtures.createComponentBarFoo();
      const addFunc = () => helper.command.addComponent('bar', { i: 'bar.f/foo' });
      helper.general.expectToThrow(addFunc, error);
    });
    it('Should prevent adding a file with invalid keys in ID', () => {
      const error = new InvalidName('bar/fo.o');
      helper.fixtures.createComponentBarFoo();
      const addFunc = () => helper.command.addComponent('bar', { i: 'bar/fo.o' });
      helper.general.expectToThrow(addFunc, error);
    });
    it('Define dynamic main file ', () => {
      const mainFileOs = path.normalize('{PARENT}/{PARENT}.js');
      helper.fs.createFile('bar', 'bar.js');
      helper.fs.createFile('bar', 'foo1.js');
      helper.command.addComponent('bar', { m: mainFileOs, n: 'test' });
      const bitMap = helper.bitMap.read();
      const mainFile = bitMap['test/bar'].mainFile;
      expect(bitMap).to.have.property('test/bar');
      expect(mainFile).to.equal('bar/bar.js');
    });
    it('Should return error if used an invalid ID', () => {
      helper.fs.createFile('bar', 'foo.js');
      const addFunc = () => helper.command.addComponent('bar', { i: 'Bar/foo' });
      const error = new InvalidName('Bar/foo');
      helper.general.expectToThrow(addFunc, error);
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
  describe('with multiple index files', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fs.createFile('bar', 'index.js');
      helper.fs.createFile('bar', 'foo.js');
      helper.fs.createFile(path.join('bar', 'exceptions'), 'some-exception.js');
      helper.fs.createFile(path.join('bar', 'exceptions'), 'index.js');
      helper.command.addComponent('bar', { i: 'bar/foo' });
    });
    it('should identify the closest index file as the main file', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap['bar/foo'].mainFile).to.equal('bar/index.js');
    });
  });
  describe('add component/s with gitignore', () => {
    let errorMessage;
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
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
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fs.createFile('bar', 'foo.js');
      helper.fs.createFile('bar', 'foo3.js');
      helper.fs.createFile('bar', 'boo.js');
      helper.fs.createFile('bar', 'index.js');
      helper.git.writeGitIgnore(['bar/foo.js', 'bar/foo3.js']);
      output = helper.command.addComponent(path.normalize('bar'), { i: 'bar/foo' });
    });
    it('Should track component ', () => {
      expect(output).to.contain('tracking component bar/foo');
    });
    it('Should contain component inside bitmap', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('bar/foo');
    });
    it('Should contain inside bitmap only files that are not inside gitignore', () => {
      const bitMap = helper.bitMap.read();
      const expectedArray = [
        { relativePath: 'bar/boo.js', test: false, name: 'boo.js' },
        { relativePath: 'bar/index.js', test: false, name: 'index.js' },
      ];
      expect(bitMap).to.have.property('bar/foo');
      const files = bitMap['bar/foo'].files;
      expect(files).to.be.array();
      expect(files).to.be.ofSize(2);
      expect(files).to.deep.equal(expectedArray);
    });
  });
  describe('add component when id includes a version', () => {
    before(() => {
      helper.scopeHelper.initLocalScope();
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
      helper.scopeHelper.initLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fs.createFile('mainDir', 'mainFile.js');
    });
    it('should throw an exception TestIsDirectory', () => {
      const addFunc = () => helper.command.addComponent('bar', { i: 'bar/foo', m: 'mainDir' });
      const mainPath = path.join(helper.scopes.localPath, 'mainDir');
      const error = new MainFileIsDir(mainPath);
      helper.general.expectToThrow(addFunc, error);
    });
  });
  describe('add file as lowercase and then re-add it as CamelCase', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      fs.removeSync(path.join(helper.scopes.localPath, 'bar'));
      helper.fs.createFile('Bar', 'foo.js');
      helper.command.addComponent('Bar', { i: 'bar/foo' });
    });
    it('should update the files and the mainFile with the new case', () => {
      const bitMap = helper.bitMap.read();
      const componentMap = bitMap['bar/foo'];
      expect(componentMap.files).to.have.lengthOf(1);
      expect(componentMap.files[0].relativePath).to.equal('Bar/foo.js');
      expect(componentMap.files[0].relativePath).to.not.equal('bar/foo.js');
      expect(componentMap.mainFile).to.equal('Bar/foo.js');
    });
  });
  describe('add the main file when it was removed before', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fs.createFile('bar', 'foo.js');
      helper.fs.createFile('bar', 'foo-main.js');
      helper.command.addComponent('bar', { m: 'foo-main.js', i: 'bar/foo' });
      helper.fs.deletePath('bar/foo-main.js');
      const status = helper.command.status();
      expect(status).to.have.string(statusInvalidComponentsMsg);
      expect(status).to.have.string('main-file was removed');
      helper.fs.createFile('bar', 'foo-main2.js');
      output = helper.command.addComponent('bar/foo-main2.js', { m: 'bar/foo-main2.js', i: 'bar/foo' });
    });
    it('should add the main file successfully', () => {
      expect(output).to.have.string('added bar/foo-main2.js');
    });
  });
  describe('directory is with upper case and test/main flags are written with lower case', () => {
    let addOutput;
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fs.createFile('Bar', 'foo.js');
      addOutput = helper.general.runWithTryCatch('bit add Bar -i bar -m bar/foo.js');
    });
    it('should throw an error for case sensitive filesystem saying the file was not found. for other system, it should work', () => {
      if (addOutput.includes('error')) {
        expect(addOutput).to.have.string('file or directory');
        expect(addOutput).to.have.string('was not found');
      } else {
        expect(addOutput).to.have.string('added');
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.have.property('bar');
        const files = bitMap.bar.files.map((file) => file.relativePath);
        expect(files).to.include('Bar/foo.js');
        expect(files).to.include('Bar/foo.spec.js');
        expect(files).not.to.include('bar/foo.js');
        expect(files).not.to.include('bar/foo.js');
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
      helper.scopeHelper.initWorkspace(consumerDir);
    });
    it('should throw PathOutsideConsumer error', () => {
      const addCmd = () => helper.command.addComponent('../foo', undefined, consumerDir);
      const error = new PathOutsideConsumer(path.normalize('../foo'));
      helper.general.expectToThrow(addCmd, error);
    });
  });
  describe('no mainFile and one of the files has the same name as the directory', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fs.createFile('bar', 'bar.js');
      helper.fs.createFile('bar', 'foo.js');
      helper.command.addComponent('bar');
    });
    it('should resolve the mainFile as the file with the same name as the directory', () => {
      const bitMap = helper.bitMap.read();
      const bar = bitMap.bar;
      expect(bar.mainFile).to.equal('bar/bar.js');
    });
  });
  describe('sort .bitmap components', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fs.createFileOnRootLevel('aaa/aaa.js');
      helper.fs.createFileOnRootLevel('bbb/bbb.js');
      helper.fs.createFileOnRootLevel('ccc/ccc.js');
      helper.fs.createFileOnRootLevel('ddd/ddd.js');
      helper.command.addComponent('bbb');
      helper.command.addComponent('ddd');
      helper.command.addComponent('aaa');
      helper.command.addComponent('ccc');
    });
    it('should sort the components in .bitmap file alphabetically', () => {
      const bitMap = helper.bitMap.read();
      const ids = Object.keys(bitMap);
      expect(ids[0]).to.equal('aaa');
      expect(ids[1]).to.equal('bbb');
      expect(ids[2]).to.equal('ccc');
      expect(ids[3]).to.equal('ddd');
    });
  });
});
