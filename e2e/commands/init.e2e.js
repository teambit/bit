import chai, { expect } from 'chai';
import Helper from '../e2e-helper';

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('run bit init', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('prevent running bit init more than once', () => {
    beforeEach(() => {
      helper.reInitLocalScope();
    });
    it('Should tell the user there is already a scope when running bit init twice', () => {
      let errorMsg;
      try {
        helper.initLocalScope();
      } catch (err) {
        errorMsg = err.message;
      }
      expect(errorMsg).to.have.string("there's already a scope");
    });
  });
});
