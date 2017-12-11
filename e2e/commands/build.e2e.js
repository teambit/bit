import chai, { expect } from 'chai';
import Helper from '../e2e-helper';

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('bit build', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe.only('importing and using compiler', () => {
    beforeEach(() => {
      helper.reInitLocalScope();
      helper.createFile();
      helper.addComponentBarFoo();
    });
    it('Should not be able to build without importing a build env', () => {
      const output = helper.build();
      expect(output).to.have.string('nothing to build');
    });
    it('Should successfully import and build using the babel compiler', () => {
      let output = helper.runCmd('bit import bit.envs/compilers/babel -c');
      expect(output).to.have.string('the following component environments were installed\n- bit.envs/compilers/babel@');
      output = helper.build();
      expect(output).to.have.string('-local/dist/bar/foo.js.map');
      expect(output).to.have.string('-local/dist/bar/foo.js');
    });
  });
});
