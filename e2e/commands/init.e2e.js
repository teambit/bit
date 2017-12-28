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
  beforeEach(() => {
    helper.reInitLocalScope();
  });
  // skip since we change the behaviour to work when running bit init twice
  it.skip('Should tell the user there is already a scope when running bit init twice', () => {
    let errorMsg;
    try {
      helper.initLocalScope();
    } catch (err) {
      errorMsg = err.message;
    }
    expect(errorMsg).to.have.string("there's already a scope");
  });
});

describe('automatic bit init when .bit.map.json already exists', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  before(() => {
    helper.createBitMap();
  });
  it('Should not tell you there is already a scope when running "bit init"', () => {
    const init = helper.initLocalScope();
    expect(init).to.have.string('successfully initialized an empty bit scope');
  });
});
