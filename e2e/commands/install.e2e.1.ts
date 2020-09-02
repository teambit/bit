import chai, { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';

import { DEFAULT_PACKAGE_MANAGER, IS_WINDOWS } from '../../src/constants';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

// TODO:
// bring back these tests once other flows tested here (namely import) also support the new "harmony" paradigm
//
// right now this isn't working because if we init the workspace with librarian, importing components doesn't work properly
describe.skip('run bit install', function () {
  if (IS_WINDOWS || process.env.APPVEYOR === 'True') {
    // for some reason, on AppVeyor it throws an error:
    // ```
    // Error: Command failed: bit install
    // failed running npm install at C:\Users\appveyor\AppData\Local\Temp\1\bit\e2e\cjmoyldi-local
    // npm ERR! Cannot read property 'match' of undefined
    // ```
    // @ts-ignore
    this.skip;
  } else {
    this.timeout(0);
    let helper: Helper;
    before(() => {
      helper = new Helper();
      helper.scopeHelper.usePackageManager(DEFAULT_PACKAGE_MANAGER);
    });
    after(() => {
      helper.scopeHelper.destroy();
    });
    describe('importing a component with dependency and a package dependency', () => {
      let localScope;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.npm.addNpmPackage('lodash.isstring', '4.0.0');
        const isStringFixture = `const lodashIsString = require('lodash.isstring');
  module.exports = function isString() { return 'isString: ' + lodashIsString() +  ' and got is-string'; };`;
        helper.fs.createFile('utils', 'is-string.js', isStringFixture);
        helper.fixtures.addComponentUtilsIsString();
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();

        const requirePath = helper.general.getRequireBitPath('utils', 'is-string');
        const fooBarFixture = `const isString = require('${requirePath}');
  module.exports = function foo() { return isString() + ' and got foo'; };`;
        helper.fixtures.createComponentBarFoo(fooBarFixture);
        helper.fs.createFile('bar', 'foo.js', fooBarFixture);
        helper.fixtures.addComponentBarFoo();
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();

        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo');

        helper.command.runCmd('npm install --save lodash.isboolean');
        const fooRequirePath = helper.general.getRequireBitPath('bar', 'foo');
        const appJsFixture = `const barFoo = require('${fooRequirePath}');
  const isBoolean = require('lodash.isboolean');
  console.log('isBoolean: ' + isBoolean(true) + ', ' + barFoo());`;
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
        localScope = helper.scopeHelper.cloneLocalScope();
      });
      it('should print results from all dependencies (this is an intermediate check to make sure we are good so far)', () => {
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('isBoolean: true, isString: false and got is-string and got foo');
      });
      describe('cloning the project to somewhere else without the node-modules directories', () => {
        let output;
        before(() => {
          helper.git.mimicGitCloneLocalProject();
          helper.scopeHelper.addRemoteScope();
          helper.command.runCmd('bit import');
          // @todo: to reproduce issue #1746, remove the next line
          helper.fs.deletePath('package-lock.json');
          output = helper.command.runCmd('bit install');
        });
        it('bit install should npm-install all missing node-modules and link all components', () => {
          expect(output).to.have.string('Successfully installed 1 component(s)');
          const result = helper.command.runCmd(
            `node -r ${path.join(
              __dirname,
              '..',
              '..',
              'node_modules',
              'librarian',
              'src',
              'main',
              'runtime.js'
            )} app.js`
          );
          expect(result.trim()).to.equal('isBoolean: true, isString: false and got is-string and got foo');
        });
        describe('running bit install from an inner directory', () => {
          before(() => {
            output = helper.command.runCmd('bit install', path.join(helper.scopes.localPath, 'components'));
          });
          it('should not create another directory inside that inner directory', () => {
            expect(path.join(helper.scopes.localPath, 'components', 'components')).to.not.be.a.path();
          });
          it('should install npm packages with absolute paths', () => {
            expect(output).to.not.have.string('successfully ran npm install at components/bar/foo');
            expect(output).to.have.string(path.join(helper.scopes.localPath, 'components/bar/foo'));
          });
        });
      });
      describe('deleting node_modules of one component and running bit install [id]', () => {
        let output;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScope);
          fs.removeSync(path.join(helper.scopes.localPath, 'components/bar/foo/node_modules'));
          output = helper.command.runCmd('bit install bar/foo');
        });
        it('should npm install only the specified id', () => {
          expect(output).to.have.string('successfully ran npm install at components/bar/foo');
        });
        it('should link only the specified id and its dependencies', () => {
          expect(output).to.have.string('linked 2 components'); // 1 is for bar/foo and 2 for its dep is-string
        });
        it('all links should be in place', () => {
          const result = helper.command.runCmd('node app.js');
          expect(result.trim()).to.equal('isBoolean: true, isString: false and got is-string and got foo');
        });
      });
      describe('with specific package-manager arguments', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScope);
        });
        describe('passing arguments via the command line', () => {
          let output;
          before(() => {
            output = helper.command.runCmd('bit install bar/foo -- --no-optional');
          });
          it('npm should install the packages with the specified arguments', () => {
            expect(output).to.have.string(
              'successfully ran npm install at components/bar/foo with args: --no-optional'
            );
          });
        });
        describe('passing arguments via the consumer bit.json', () => {
          let output;
          before(() => {
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            helper.bitJson.modifyField('packageManagerArgs', ['--production']);
            output = helper.command.runCmd('bit install bar/foo');
          });
          it('npm should install the packages with the specified arguments', () => {
            expect(output).to.have.string('successfully ran npm install at components/bar/foo with args: --production');
          });
        });
        describe('passing arguments via both the command line and consumer bit.json', () => {
          let output;
          before(() => {
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            helper.bitJson.modifyField('packageManagerArgs', ['--production']);
            output = helper.command.runCmd('bit install bar/foo -- --no-optional');
          });
          it('npm should install the packages according to the command line and ignore the consumer bit.json', () => {
            expect(output).to.have.string(
              'successfully ran npm install at components/bar/foo with args: --no-optional'
            );
            expect(output).to.not.have.string('--production');
          });
        });
      });
    });
  }
});
