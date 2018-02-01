import chai, { expect } from 'chai';
import path from 'path';
import Helper from '../e2e-helper';
import BitsrcTester from '../bitsrc-tester';

chai.use(require('chai-fs'));

describe.only('export --eject functionality using bitsrc.io', function () {
  this.timeout(0);
  const helper = new Helper();
  const bitsrcTester = new BitsrcTester();
  let scopeName;
  before(() => {
    return bitsrcTester
      .loginToBitSrc()
      .then(() => bitsrcTester.createScope())
      .then((scope) => {
        console.log('a new scope has been generated on bitsrc.io ', scope);
        scopeName = scope;
      });
  });
  after(() => {
    helper.destroyEnv();
    return bitsrcTester.deleteScope(scopeName);
  });
  describe('as author', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagAllWithoutMessage();
      helper.exportAllComponents(`tester.${scopeName} --eject`);
    });
    it('should delete the original component files from the file-system', () => {
      expect(path.join(helper.localScopePath, 'bar', 'foo.js')).not.to.be.a.path();
    });
    it('should have the component files as a package (in node_modules)', () => {
      expect(path.join(helper.localScopePath, 'node_modules', '@bit', `${scopeName}.bar.foo`, 'foo.js')).to.be.a.path();
    });
    it('should delete the component from bit.map', () => {
      const bitMap = helper.readBitMap();
      Object.keys(bitMap).forEach((id) => {
        expect(id).not.to.have.string('foo');
      });
    });
  });
});
