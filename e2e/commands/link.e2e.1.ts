import chai, { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';

import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';

chai.use(require('chai-fs'));

describe('bit link', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });

  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('author components', () => {
    describe('before export', () => {
      let beforeLink;
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fixtures.populateWorkspaceWithUtilsIsType();
        beforeLink = helper.scopeHelper.cloneLocalScope();
      });
      describe('when scopeDefault is not set', () => {
        let linkOutput;
        before(() => {
          linkOutput = helper.command.link();
        });
        it('should create links although the paths do not have scope name (until export)', () => {
          expect(linkOutput).to.have.string(path.normalize('node_modules/@bit/utils.is-type/utils/is-type.js'));
          expect(path.join(helper.scopes.localPath, 'node_modules')).to.be.a.directory();
        });
      });
      describe('when scopeDefault is set', () => {
        let linkOutput;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(beforeLink);
          const bitJson = helper.bitJson.read();
          bitJson.defaultScope = helper.scopes.remote;
          helper.bitJson.write(bitJson);
          linkOutput = helper.command.runCmd('bit link');
        });
        it('should create links consist of the defaultScope', () => {
          expect(linkOutput).to.have.string(
            path.normalize(`node_modules/@bit/${helper.scopes.remote}.utils.is-type/utils/is-type.js`)
          );
          expect(path.join(helper.scopes.localPath, 'node_modules')).to.be.a.directory();
          expect(
            path.join(helper.scopes.localPath, `node_modules/@bit/${helper.scopes.remote}.utils.is-type`)
          ).to.be.a.directory();
        });
      });
      describe('when defaultScope is overridden for this component', () => {
        let linkOutput;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(beforeLink);
          const bitJson = helper.bitJson.read();
          bitJson.defaultScope = helper.scopes.remote;
          helper.bitJson.write(bitJson);
          helper.bitJson.addOverrides({ 'utils/is-type': { defaultScope: 'my-new-remote' } });
          linkOutput = helper.command.runCmd('bit link');
        });
        it('should create links consist of the defaultScope', () => {
          expect(linkOutput).to.have.string(
            path.normalize('node_modules/@bit/my-new-remote.utils.is-type/utils/is-type.js')
          );
          expect(path.join(helper.scopes.localPath, 'node_modules')).to.be.a.directory();
          expect(
            path.join(helper.scopes.localPath, `node_modules/@bit/my-new-remote.utils.is-type`)
          ).to.be.a.directory();
        });
      });
    });
    describe('after export', () => {
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fixtures.populateWorkspaceWithUtilsIsType();
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();

        // requiring is-type through the internal file (@bit/remoteScope.utils.is-type/utils/is-type)
        const isStringFixture = `const isType = require('@bit/${helper.scopes.remote}.utils.is-type/utils/is-type');
module.exports = function isString() { return isType() +  ' and got is-string'; };`;
        helper.fs.createFile('utils', 'is-string.js', isStringFixture);
        helper.fixtures.addComponentUtilsIsString();
        const appJsFixture = "const isString = require('./utils/is-string'); console.log(isString());";
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);

        // requiring is-type through the main index file (@bit/remoteScope.utils.is-type)
        const appJSMainFixture = `const isType = require('@bit/${helper.scopes.remote}.utils.is-type');
console.log(isType());`;
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app-main.js'), appJSMainFixture);
      });
      it('should generate links to all component files as part of the export process', () => {
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string');
      });
      it('should generate a link form node_modules/@bit/component-name root to the main file as part of the export process', () => {
        const result = helper.command.runCmd('node app-main.js');
        expect(result.trim()).to.equal('got is-type');
      });
      describe('after deleting node_modules and running bit link', () => {
        before(() => {
          fs.removeSync(path.join(helper.scopes.localPath, 'node_modules'));
          helper.command.runCmd('bit link');
        });
        it('should re-generate the links successfully', () => {
          const result = helper.command.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type and got is-string');

          const resultMain = helper.command.runCmd('node app-main.js');
          expect(resultMain.trim()).to.equal('got is-type');
        });
      });
      describe('after deleting node_modules and running bit link from an inner directory', () => {
        before(() => {
          fs.removeSync(path.join(helper.scopes.localPath, 'node_modules'));
          helper.command.runCmd('bit link', path.join(helper.scopes.localPath, 'utils'));
        });
        it('should not create the node_modules in the inner directory', () => {
          expect(path.join(helper.scopes.localPath, 'utils', 'node_modules')).to.not.be.a.path();
        });
        it('should re-generate the links successfully', () => {
          const result = helper.command.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type and got is-string');

          const resultMain = helper.command.runCmd('node app-main.js');
          expect(resultMain.trim()).to.equal('got is-type');
        });
      });
    });
  });
  describe('with custom bind name in bit.json', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.bitJson.modifyField('bindingPrefix', 'testLink');
      helper.fixtures.tagComponentBarFoo();
      helper.command.exportComponent('bar/foo');
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');
    });
    describe('auto linking', () => {
      it('node_modules should contain custom dir name', () => {
        expect(path.join(helper.scopes.localPath, 'node_modules', '@testLink')).to.be.a.path();
      });
      it('should create symlink inside custom folder', () => {
        expect(
          path.join(helper.scopes.localPath, 'node_modules', '@testLink', `${helper.scopes.remote}.bar.foo`)
        ).to.be.a.path();
      });
    });
    describe('manual linking', () => {
      before(() => {
        fs.removeSync(path.join(helper.scopes.localPath, 'node_modules', '@testLink'));
        helper.command.runCmd('bit link');
      });
      it('node_modules should contain custom dir name', () => {
        expect(path.join(helper.scopes.localPath, 'node_modules', '@testLink')).to.be.a.path();
      });
      it('should create symlink inside custom folder', () => {
        expect(
          path.join(helper.scopes.localPath, 'node_modules', '@testLink', `${helper.scopes.remote}.bar.foo`)
        ).to.be.a.path();
      });
    });
  });
  describe('import 2 components into same link dir', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fs.createFile('bar2', 'foo2.js');
      helper.fixtures.addComponentBarFoo();
      helper.command.addComponent('bar2/foo2.js', { i: 'bar2/foo2' });
      helper.bitJson.modifyField('bindingPrefix', 'test');
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');
      helper.command.importComponent('bar2/foo2');
    });
    it('node_modules should contain custom dir name', () => {
      expect(path.join(helper.scopes.localPath, 'node_modules', '@test')).to.be.a.path();
      expect(
        path.join(helper.scopes.localPath, 'node_modules', '@test', `${helper.scopes.remote}.bar.foo`)
      ).to.be.a.path();
      expect(
        path.join(helper.scopes.localPath, 'node_modules', '@test', `${helper.scopes.remote}.bar2.foo2`)
      ).to.be.a.path();
    });
  });
  describe('component with dependency tree of 2', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithUtilsIsType();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('utils/is-type');
      const isStringFixture = `const isType = require('${helper.general.getRequireBitPath(
        'utils',
        'is-type'
      )}'); module.exports = function isString() { return isType() +  ' and got is-string'; };`;
      helper.fs.createFile('utils', 'is-string.js', isStringFixture);
      helper.fixtures.addComponentUtilsIsString();
      helper.bitJson.modifyField('bindingPrefix', 'bitTest');
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('utils/is-string');
    });
    it('node_modules should contain custom dir name', () => {
      expect(path.join(helper.scopes.localPath, 'node_modules', '@bitTest')).to.be.a.path();
    });
  });
  describe('component with dependency tree of 3', () => {
    before(() => {
      // is-type
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithUtilsIsType();
      helper.bitJson.modifyField('bindingPrefix', '@bitTest');
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();

      // is-string
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('utils/is-type');
      const isStringFixture = `const isType = require('@bitTest/${helper.scopes.remote}.utils.is-type'); module.exports = function isString() { return isType() +  ' and got is-string'; };`;
      helper.fs.createFile('utils', 'is-string.js', isStringFixture);
      helper.fixtures.addComponentUtilsIsString();
      helper.bitJson.modifyField('bindingPrefix', '@bitTest2');
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();

      // is-string2
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('utils/is-string');
      const isStringFixture2 = `const isString = require('@bitTest2/${helper.scopes.remote}.utils.is-string'); module.exports = function isString2() { return isString() +  ' and got is-string2'; };`;
      helper.fs.createFile('test', 'is-string2.js', isStringFixture2);
      helper.command.addComponent('test/is-string2.js', { i: 'test/is-string2' });
      helper.bitJson.modifyField('bindingPrefix', '@bitTest2');
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('test/is-string2');

      const appJsFixture = `const isString2 = require('@bitTest2/${helper.scopes.remote}.test.is-string2'); console.log(isString2());`;
      fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
    });
    it('node_modules should contain custom dir name', () => {
      expect(path.join(helper.scopes.localPath, 'node_modules', '@bitTest2')).to.be.a.path();
    });
    it('node_modules should contain custom dir name2', () => {
      expect(
        path.join(
          helper.scopes.localPath,
          'node_modules',
          '@bitTest2',
          `${helper.scopes.remote}.test.is-string2`,
          'node_modules',
          '@bitTest2'
        )
      ).to.be.a.path();
    });
    it('node_modules should contain custom dir name3', () => {
      expect(
        path.join(
          helper.scopes.localPath,
          'node_modules',
          '@bitTest2',
          `${helper.scopes.remote}.test.is-string2/node_modules/@bitTest2/${helper.scopes.remote}.utils.is-string/node_modules/@bitTest`
        )
      ).to.be.a.path();
    });
    it('should print results from the dependency that uses require absolute syntax', () => {
      const result = helper.command.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got is-string2');
    });
    describe('bit link after deleting the current node_modules directories', () => {
      before(() => {
        fs.removeSync(path.join(helper.scopes.localPath, 'node_modules'));
        fs.removeSync(path.join(helper.scopes.localPath, 'components', 'test', 'is-string2', 'node_modules'));
        helper.command.runCmd('bit link');
      });
      it('should still print results from the dependency that uses require absolute syntax', () => {
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got is-string2');
      });
    });
    describe('bit link after deleting the current node_modules directories from an inner directory', () => {
      before(() => {
        fs.removeSync(path.join(helper.scopes.localPath, 'node_modules'));
        fs.removeSync(path.join(helper.scopes.localPath, 'components', 'test', 'is-string2', 'node_modules'));
        helper.command.runCmd('bit link', path.join(helper.scopes.localPath, 'components'));
      });
      it('should not create node_modules directory inside the inner directory', () => {
        expect(path.join(helper.scopes.localPath, 'components', 'node_modules')).not.to.be.a.path();
      });
      it('should still print results from the dependency that uses require absolute syntax', () => {
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got is-string2');
      });
    });
  });
  describe('rewire', () => {
    let beforeLink;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithThreeComponents();
      helper.fs.outputFile('app.js', fixtures.appPrintBarFooAuthor);
      beforeLink = helper.scopeHelper.cloneLocalScope();
    });
    describe('with no defaultScope', () => {
      let output;
      before(() => {
        output = helper.command.linkAndRewire();
      });
      it('should change the require statement to be module path with no-scope', () => {
        const barFoo = helper.fs.readFile('bar/foo.js');
        expect(barFoo).to.have.string('@bit/utils.is-string');
        expect(barFoo).to.not.have.string('../utils/is-string.js');
      });
      it('the app should work after changing the code', () => {
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
      it('should show results from the rewire step', () => {
        expect(output).to.have.string('rewired');
      });
    });
    describe('with defaultScope', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeLink);
        helper.bitJson.addDefaultScope();
        helper.command.linkAndRewire();
      });
      it('should change the require statement to be module path with no-scope', () => {
        const barFoo = helper.fs.readFile('bar/foo.js');
        expect(barFoo).to.have.string(`@bit/${helper.scopes.remote}.utils.is-string`);
        expect(barFoo).to.not.have.string('../utils/is-string.js');
      });
      it('the app should work after changing the code', () => {
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
    });
    describe('with entering specific ids', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeLink);
        output = helper.command.linkAndRewire('bar/foo');
      });
      it('should link only the specified ids', () => {
        expect(output).to.have.string('linked 1 components');
      });
      it('should rewire only the specified ids', () => {
        expect(output).to.have.string('rewired 1 components');
      });
    });
    describe('with css files in one dir and extension', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fs.outputFile('foo/foo.css', 'h1 { color:green; }');
        helper.fs.outputFile('bar/bar.css', '@import "../foo/foo.css";');
        helper.command.addComponent('foo');
        helper.command.addComponent('bar');
        helper.command.linkAndRewire();
      });
      it('should add a tilda before the package name', () => {
        const bar = helper.fs.readFile('bar/bar.css');
        expect(bar).to.have.string('@import "~@bit/foo"');
      });
    });
    describe('with sass files in the same dir and no extension', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fs.outputFile('foo.sass', 'h1 { color:green; }');
        helper.fs.outputFile('bar.sass', '@import "foo";');
        helper.command.addComponent('foo.sass');
        helper.command.addComponent('bar.sass');
        helper.command.linkAndRewire();
      });
      it('should add a tilda before the package name', () => {
        const bar = helper.fs.readFile('bar.sass');
        expect(bar).to.have.string('@import "~@bit/foo"');
      });
    });
  });
});
