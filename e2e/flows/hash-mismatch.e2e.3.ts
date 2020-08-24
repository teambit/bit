import { expect } from 'chai';

import Helper from '../../src/e2e-helper/e2e-helper';

/**
 * previously, when a Version hash was changed, you'd get an error upon importing the component
 *
 * ➜  bit import hash-mismatch-case/foo
found hash mismatch of hash-mismatch-case/foo, version 0.0.1.
  originalHash: 6bd019fe5dbf11a5adf2f68d0099457ad077fa8c.
  currentHash: d24622f13dbbbc8b1f59535a8bea342924b8867a
  this usually happens when a component is old and the migration script was not running or interrupted
 *
 * it's impossible to change the calculated hash during the e2e-tests. so we can't generate this
 * case on the fly. instead, we prepared such a scope from advance and copied it into the fixtures
 * directory. (at fixtures/scopes/hash-mismatch-case). this dir contains a complete bare scope that
 * has one component "foo" and its version (0.0.1) has a hash that was calculated after some
 * manipulation. as a result, when importing this component "foo" to a local scope, the original
 * hash is different than the currently calculated hash.
 * in Bit version <= 14.4.3, when importing this component, you'd get the exact same error as above.
 * now, we expect the import to work with no errors and to save the version object into the
 * original hash path (6b/d019fe5dbf11a5adf2f68d0099457ad077fa8c).
 */
describe('hash mismatch', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('mismatch', () => {
    let output: string;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.scopes.setRemoteScope(false, undefined, 'hash-mismatch-case');
      helper.scopeHelper.reInitRemoteScope();
      helper.scopeHelper.addRemoteScope();
      helper.fixtures.copyFixtureDir('scopes/hash-mismatch-case/', helper.scopes.remotePath);
      output = helper.command.importComponent('foo');
    });
    it('should be able to import the component', () => {
      expect(output).to.have.string('successfully imported one component');
    });
    it('should save the Version object into the original hash', () => {
      const objectsFiles = helper.fs.getObjectFiles();
      expect(objectsFiles).to.have.lengthOf(4);
      expect(objectsFiles).to.deep.include(`6b/d019fe5dbf11a5adf2f68d0099457ad077fa8c`);
    });
  });
});
