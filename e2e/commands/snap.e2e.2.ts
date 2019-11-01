import { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import { HASH_SIZE } from '../../src/constants';

describe('bit snap command', function() {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('snap before tag', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      output = helper.command.snapComponent('bar/foo');
    });
    it('should snap successfully', () => {
      expect(output).to.have.string('1 component(s) snapped');
    });
    it('should save the snap head in the component object', () => {
      const foo = helper.command.catComponent('bar/foo');
      expect(foo).to.have.property('snaps');
      expect(foo.snaps).to.have.property('head');
      expect(foo.snaps.head).to.be.a('string');
      expect(foo.snaps.head.length).to.equal(HASH_SIZE);
    });
    it('should save the snap hash as a version in .bitmap file', () => {
      const listScope = helper.command.listLocalScopeParsed();
      const hash = listScope[0].localVersion;
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property(`bar/foo@${hash}`);
    });
    it('bit status should show the snap as staged', () => {
      const status = helper.command.status();
      expect(status).to.have.string('staged components');
    });
  });
});
