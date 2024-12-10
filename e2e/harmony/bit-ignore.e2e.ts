import { expect } from 'chai';

import { Helper } from '@teambit/legacy.e2e-helper';

describe('Bit Ignore functionality', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('adding .bitignore in a comp dir', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile('comp1/.bitignore', '*.json');
      helper.fs.outputFile('comp1/hello.json', '{"hello": "world"}');
    });
    it('should respect the .bitignore file and ignore according to the pattern', () => {
      const files = helper.command.getComponentFiles('comp1');
      expect(files).to.include('.bitignore');
      expect(files).to.not.include('hello.json');
      expect(files).to.include('index.js');
    });
  });
  describe('adding .bitignore in the root dir', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile('.bitignore', '*.json');
      helper.fs.outputFile('comp1/hello.json', '{"hello": "world"}');
    });
    it('should respect the .bitignore file and ignore according to the pattern', () => {
      const files = helper.command.getComponentFiles('comp1');
      expect(files).to.not.include('hello.json');
      expect(files).to.include('index.js');
    });
  });
  describe('adding .gitignore and an empty .bitignore in the root dir', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile('.gitignore', '*.json');
      helper.fs.outputFile('.bitignore', '');
      helper.fs.outputFile('comp1/hello.json', '{"hello": "world"}');
    });
    it('should only consider the .bitignore and ignore the .gitignore file', () => {
      const files = helper.command.getComponentFiles('comp1');
      expect(files).to.include('hello.json');
    });
  });
  describe('adding only .gitignore in the component dir', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile('comp1/.gitignore', '*.json');
      helper.fs.outputFile('comp1/hello.json', '{"hello": "world"}');
    });
    it('should consider the .gitignore, ignore the patterns in it, but track this .gitignore file', () => {
      const files = helper.command.getComponentFiles('comp1');
      expect(files).to.include('.gitignore');
      expect(files).to.not.include('hello.json');
    });
  });
  describe('adding .gitignore and .bitignore in the component dir', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile('comp1/.bitignore', '');
      helper.fs.outputFile('comp1/.gitignore', '*.json');
      helper.fs.outputFile('comp1/hello.json', '{"hello": "world"}');
    });
    it('.bitignore should take precedence', () => {
      const files = helper.command.getComponentFiles('comp1');
      expect(files).to.include('.gitignore');
      expect(files).to.include('hello.json');
    });
  });
});
