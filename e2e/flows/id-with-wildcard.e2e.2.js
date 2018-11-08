import { expect } from 'chai';
import Helper from '../e2e-helper';

describe('component id with wildcard', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('adding', () => {
    // let scopeAfterAdd;
    before(() => {
      helper.reInitLocalScope();
      helper.createFile('utils/is', 'string.js');
      helper.createFile('utils/is', 'type.js');
      helper.createFile('utils/fs', 'read.js');
      helper.createFile('utils/fs', 'write.js');
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.addComponent('utils/is/*', { n: 'utils/is' });
      helper.addComponent('utils/fs/*', { n: 'utils/fs' });
      // scopeAfterAdd = helper.cloneLocalScope();
    });
    describe('tagging with wildcard', () => {
      describe('when wildcard does not match any component', () => {
        it('should not tag any component', () => {
          const output = helper.commitComponent('none/*');
          expect(output).to.have.string('0 components tagged');
        });
      });
      describe('when wildcard match some of the components', () => {
        let output;
        before(() => {
          output = helper.commitComponent('"utils/is/*"');
        });
        it('should indicate the tagged components', () => {
          expect(output).to.have.string('2 components tagged');
          expect(output).to.have.string('utils/is/string');
          expect(output).to.have.string('utils/is/type');
        });
        it('should tag only the matched components', () => {
          const status = helper.statusJson();
          expect(status.stagedComponents).to.have.lengthOf(2);
          expect(status.newComponents).to.have.lengthOf(3);
        });
      });
    });
  });
});
