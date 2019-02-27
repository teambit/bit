import chai, { expect } from 'chai';
import Helper from '../e2e-helper';
import ComponentOutOfSync from '../../src/consumer/exceptions/component-out-of-sync';

chai.use(require('chai-fs'));

describe('components that are not synced between the scope and the consumer', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('consumer with a new component and scope with the same component as staged', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagComponentBarFoo();
      helper.deleteBitMap();
      helper.addComponentBarFoo();
    });
    describe('bit tag', () => {
      it('should throw an error and not allowing tagging the component', () => {
        const error = new ComponentOutOfSync('bar/foo');
        const tagCmd = () => helper.tagComponentBarFoo();
        helper.expectToThrow(tagCmd, error);
      });
    });
    describe('bit status', () => {
      it('should throw an error', () => {
        const error = new ComponentOutOfSync('bar/foo');
        const statusCmd = () => helper.status();
        helper.expectToThrow(statusCmd, error);
      });
    });
    describe('bit remove', () => {
      let output;
      before(() => {
        output = helper.removeComponent('bar/foo -s');
      });
      it('should remove the component successfully', () => {
        expect(output).to.have.string('successfully removed');
      });
      it('should delete the objects from the scope', () => {
        const catScope = helper.catScope();
        expect(catScope).to.have.lengthOf(0);
      });
    });
  });
});
