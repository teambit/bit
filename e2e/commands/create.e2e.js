import { expect } from 'chai';
import path from 'path';
import fs from 'fs-extra';
import Helper from '../e2e-helper';

describe('bit create', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });

  describe('create simple component', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.reInitRemoteScope();
      helper.addRemoteScope();
    });
    it('Should write the correct files to fs', () => {
        helper.runCmd('bit create simple');
        const dirpath = path.join(helper.localScopePath, 'components', 'global', 'simple');
        const files = fs.readdirSync(dirpath);
        expect(files).to.include('impl.js');
        // Make sure there is no other files/dirs created
        expect(files.length).to.equal(1);
    });
  });
});