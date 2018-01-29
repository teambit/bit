import chai, { expect } from 'chai';
import path from 'path';
import Helper from '../e2e-helper';

chai.use(require('chai-fs'));

const remoteScopeCI = 'david.ci';

// @todo: figure out how to authenticate into bitsrc from e2e-tests.
describe.skip('export --eject functionality using bitsrc.io', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('as author', () => {
    const randomBoxName = Math.random()
      .toString(36)
      .substr(2, 5);
    before(() => {
      helper.reInitLocalScope();
      helper.createComponent(randomBoxName, 'foo.js');
      helper.addComponent(path.join(randomBoxName, 'foo.js'));
      helper.tagAllWithoutMessage();
      helper.exportAllComponents(`${remoteScopeCI} --eject`);
    });
    after(() => {
      helper.removeComponent(`${remoteScopeCI}/${randomBoxName}/foo`, '--silent');
    });
    it('should delete the original component files from the file-system', () => {
      expect(path.join(helper.localScopePath, randomBoxName, 'foo.js')).not.to.be.a.path();
    });
    it('should have the component files as a package (in node_modules)', () => {
      expect(
        path.join(helper.localScopePath, 'node_modules', '@bit', `${randomBoxName}.${randomBoxName}.foo`, 'foo.js')
      ).not.to.be.a.path();
    });
    it('should delete the component from bit.map', () => {
      const bitMap = helper.readBitMap();
      Object.keys(bitMap).forEach((id) => {
        expect(id).not.to.have.string('foo');
      });
    });
  });
});
