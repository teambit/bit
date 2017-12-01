import { expect } from 'chai';
import path from 'path';
import fs from 'fs-extra';
import Helper from '../e2e-helper';

describe('reduce-path functionality (eliminate the original shared-dir among component files and its dependencies)', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('re-import after the author changed the originally-shared-dir', () => {
    let localConsumerFiles;
    before(() => {
      // Author creates a component in bar/foo.js
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitAllComponents();
      helper.exportAllComponents();
      const authorScope = helper.cloneLocalScope();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      // Imported user gets the component without the "bar" directory as it is an originallySharedDir
      helper.importComponent('bar/foo');
      const barFooV2 = "module.exports = function foo() { return 'got foo v2'; };";
      expect(fs.existsSync(path.join(helper.localScopePath, 'components', 'bar', 'foo', 'foo.js'))).to.be.true;
      helper.createComponent(path.join('components', 'bar', 'foo'), 'foo.js', barFooV2); // update component
      helper.commitAllComponents();
      helper.exportAllComponents();
      const importedScope = helper.cloneLocalScope();
      helper.getClonedLocalScope(authorScope);
      helper.importComponent('bar/foo');
      // Authored user updates the component with the recent changes done by Imported user
      const authorLocation = path.join(helper.localScopePath, 'bar', 'foo.js');
      expect(fs.existsSync(authorLocation)).to.be.true;
      expect(fs.readFileSync(authorLocation).toString()).to.equal(barFooV2);
      helper.createFile('', 'foo2.js');
      helper.addComponentWithOptions('foo2.js', { i: 'bar/foo' });
      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.getClonedLocalScope(importedScope);
      // Imported user update the component with the recent changes done by Authored user
      helper.importComponent('bar/foo');
      localConsumerFiles = helper.getConsumerFiles();
    });
    it('should save only the latest copy of the component and delete the old one', () => {
      expect(localConsumerFiles).to.include(path.join('components', 'bar', 'foo', 'bar', 'foo.js'));
      expect(localConsumerFiles).to.include(path.join('components', 'bar', 'foo', 'foo2.js'));
      // this makes sure that the older copy of the component is gone
      expect(localConsumerFiles).not.to.include(path.join('components', 'bar', 'foo', 'foo.js'));
    });
  });
});
