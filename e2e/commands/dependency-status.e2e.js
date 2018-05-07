import chai, { expect } from 'chai';
import path from 'path';
import Helper from '../e2e-helper';

describe('bit dependency status', function () {
  this.timeout(0);
  const helper = new Helper();  
  after(() => {
    helper.destroyEnv();
  });

  describe('all files mapped', () => {
    before(() => {      
      helper.setNewLocalAndRemoteScopes();
      helper.reInitLocalScope();
      helper.copyFixtureComponents('dependency-status');
      helper.addComponent(path.normalize('dependency-status-test-files/a.js'));
      helper.addComponent(path.normalize('dependency-status-test-files/b.js'));
      helper.addComponent(path.normalize('dependency-status-test-files/c.js'));
    });
    it('Should print no missing files as all files are mapped', () => {
        const output = helper.runCmd('bit dependency-status dependency-status-test-files/b.js');
        expect(output).to.have.string('All files in dependency tree are marked as components');        
    });
  });
  describe('not all files mapped', () => {
    before(() => {      
      helper.setNewLocalAndRemoteScopes();
      helper.reInitLocalScope();
      helper.copyFixtureComponents('dependency-status');
      helper.addComponent(path.normalize('dependency-status-test-files/a.js'));
      helper.addComponent(path.normalize('dependency-status-test-files/b.js'));
    });
    it('Should print missing files which are not mapped to bit components', () => {
        const output = helper.runCmd('bit dependency-status dependency-status-test-files/b.js');
        expect(output).to.have.string('The following file exist in dependency tree but are not a component');        
        expect(output).to.have.string('c.js');        
    });
  });
});