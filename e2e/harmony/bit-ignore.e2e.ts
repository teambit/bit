import { expect } from 'chai';

import Helper from '../../src/e2e-helper/e2e-helper';

describe('Bit Ignore functionality', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('adding .bitignore in a comp dir', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile('comp1/.bitignore', '*.json');
      helper.fs.outputFile('comp1/hello.json', '{"hello": "world"}');
    });
    it('should respect the .bitignore file and ignore according to the pattern', () => {
      const files = helper.command.getComponentFiles('comp1');
      expect(files).to.include('.bitignore');
      expect(files).to.not.include('hello.json');
      expect(files).to.include('index.js');
    });
  });
});
