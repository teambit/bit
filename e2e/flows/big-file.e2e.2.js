import fs from 'fs-extra';
import path from 'path';
import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('big text file', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('Windows format (\\r\\n)', () => {
    let tagOutput;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const bigFilePath = path.join(__dirname, '..', 'fixtures', 'big-text-file-fixture.txt');
      const bigFileContent = fs.readFileSync(bigFilePath).toString();
      const windowsFormatContent = bigFileContent.replace(/\r\n|\r|\n/g, '\r\n');
      fs.outputFileSync(path.join(helper.localScopePath, 'bar', 'big-text-file.txt'), windowsFormatContent);
      helper.createComponentBarFoo();
      helper.addComponent('bar', { i: 'bar/text', m: 'bar/foo.js' });
      tagOutput = helper.tagComponent('bar/text');
    });
    it('tagging the component should not throw any error', () => {
      expect(tagOutput).to.have.string('1 component(s) tagged');
    });
    describe('exporting and importing the component', () => {
      let importOutput;
      before(() => {
        helper.exportAllComponents();

        helper.reInitLocalScope();
        helper.addRemoteScope();
        importOutput = helper.importComponent('bar/text');
      });
      it('should work with no errors', () => {
        expect(importOutput).to.have.string('successfully imported one component');
      });
      it('should import the big file', () => {
        const filePath = path.join(helper.localScopePath, 'components/bar/text/big-text-file.txt');
        expect(filePath).to.be.a.file().and.not.empty;
      });
    });
  });
});
