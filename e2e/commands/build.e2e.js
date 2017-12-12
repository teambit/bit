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
  describe('importing and using compiler', () => {
    beforeEach(() => {
      helper.reInitLocalScope();
      helper.createFile();
      helper.addComponentBarFoo();
    });
    it('Should not be able to build without importing a build env', () => {
      const output = helper.build();
      expect(output).to.have.string('nothing to build');
    });
    it.only('Should successfully import and build using the babel compiler', () => {
      const output = helper.importCompiler('bit.envs/compilers/babel');
      expect(output).to.have.string('the following component environments were installed\n- bit.envs/compilers/babel@');
      const buildOutput = helper.build();
      expect(buildOutput).to.have.string('-local/dist/bar/foo.js.map');
      expect(buildOutput).to.have.string('-local/dist/bar/foo.js');
    });
  });
});
