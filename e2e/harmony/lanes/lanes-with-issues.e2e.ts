import chai, { expect } from 'chai';
import Helper from '../../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('lanes with various issues', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('issue - object of head of main is missing from the filesystem and remote', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(3);
      helper.command.tagWithoutBuild();
      const comp2Head = helper.command.getHead('comp2');
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.populateComponents(3, undefined, 'v3');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      const objectPath = helper.general.getHashPathOfObject(comp2Head);
      helper.fs.deleteObject(objectPath);
      helper.fs.deleteRemoteObject(objectPath);
    });
    it('bit diff diff should not throw', () => {
      expect(() => helper.command.diffLane()).not.to.throw();
      const output = helper.command.diffLane();
      expect(output).to.have.string('Diff failed on the following component(s)');
      expect(output).to.have.string('ENOENT: no such file or directory');
    });
    it('bit diff main should not throw', () => {
      expect(() => helper.command.diffLane('main')).not.to.throw();
    });
  });
});
