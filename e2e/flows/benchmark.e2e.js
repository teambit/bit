import { expect } from 'chai';
import Helper from '../e2e-helper';

const numOfComponents = 1000;

describe('benchmark', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('committing and exporting lots of components', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      for (let i = 0; i < numOfComponents; i += 1) {
        const file = `foo${i}`;
        const impl = `module.exports = function ${file}() { return 'got ${file}'; };`;
        helper.createFile('utils', `${file}.js`, impl);
      }
      helper.addComponent('utils/*');
      helper.commitAllComponents();
      helper.exportAllComponents();
    });
    it('bit list should show the correct number of exported components', () => {
      const output = helper.listRemoteScope();
      expect(output.includes(`found ${numOfComponents} components`)).to.be.true;
    });
  });
});
