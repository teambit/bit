import { expect } from 'chai';
import path from 'path';
import fs from 'fs-extra';
import Helper from '../e2e-helper';

describe('bit reset', function () {
  this.timeout(0);
  let helper;
  before(() => {
    helper = new Helper();
  });
  describe('component with multiple commits', () => {
    before(() => {
      helper.cleanEnv();
      helper.runCmd('bit init');
      helper.runCmd('bit create foo');
      helper.runCmd('bit commit foo commit-msg1');
      helper.runCmd('bit modify @this/global/foo');
      helper.runCmd('bit commit foo commit-msg2');
      helper.runCmd('bit reset @this/global/foo');
    });
    it('should delete the last version from the components directory', () => {
      const lastVersion = path.join(helper.localScopePath, 'components', 'global', 'foo', helper.localScope, '2');
      expect(fs.existsSync(lastVersion)).to.be.false;
    });
    it('should leave the first version from the components directory intact', () => {
      const lastVersion = path.join(helper.localScopePath, 'components', 'global', 'foo', helper.localScope, '1');
      expect(fs.existsSync(lastVersion)).to.be.true;
    });
    it('should place the first version in the inline_components directory', () => {
      const inlineComponentPath = path.join(helper.localScopePath, 'inline_components', 'global', 'foo');
      expect(fs.existsSync(inlineComponentPath)).to.be.true;
    });
  });

  describe('component with one commit', () => {
    before(() => {
      helper.cleanEnv();
      helper.runCmd('bit init');
      helper.runCmd('bit create foo');
      helper.runCmd('bit commit foo commit-msg1');
      helper.runCmd('bit reset @this/global/foo');
    });
    it('should delete the entire component from the components directory', () => {
      const lastVersion = path.join(helper.localScopePath, 'components', 'global', 'foo', helper.localScope);
      expect(fs.existsSync(lastVersion)).to.be.false;
    });
    it('should place the first version in the inline_components directory', () => {
      const inlineComponentPath = path.join(helper.localScopePath, 'inline_components', 'global', 'foo');
      expect(fs.existsSync(inlineComponentPath)).to.be.true;
    });
  });
});
