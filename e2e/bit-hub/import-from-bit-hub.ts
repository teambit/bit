import chai, { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';

import { BASE_WEB_DOMAIN } from '../../src/constants';
import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';
import BitsrcTester, { supportTestingOnBitsrc, username } from '../bitsrc-tester';

chai.use(require('chai-fs'));

(supportTestingOnBitsrc ? describe : describe.skip)(`importing bit components from ${BASE_WEB_DOMAIN}`, function () {
  this.timeout(0);
  let helper: Helper;
  let bitsrcTester;
  let barFooDir;
  let scopeName;
  let scopeId;
  let componentTestId;
  let scopeAfterExport;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
    bitsrcTester = new BitsrcTester();
    barFooDir = path.join(helper.scopes.localPath, 'components', 'bar', 'foo');
    return bitsrcTester
      .loginToBitSrc()
      .then(() => bitsrcTester.createScope())
      .then((scope) => {
        scopeName = scope;
        scopeId = `${username}.${scopeName}`;
        helper.scopeHelper.reInitLocalScope();
        helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
        helper.fixtures.addComponentUtilsIsType();
        helper.fs.createFile('utils', 'is-string.js', fixtures.isString);
        helper.fixtures.addComponentUtilsIsString();
        helper.fixtures.createComponentBarFoo(fixtures.barFooFixture);
        helper.fixtures.addComponentBarFoo();
        helper.command.tagAllComponents();
        helper.command.exportAllComponents(scopeId);
        scopeAfterExport = helper.scopeHelper.cloneLocalScope();

        helper.scopeHelper.reInitLocalScope();
        helper.env.importCompiler('bit.envs/compilers/babel@0.0.20');
        helper.fs.createFile('utils', 'is-type-es6.js', fixtures.isTypeES6);
        helper.command.addComponent('utils/is-type-es6.js', { i: 'utils/is-type-es6' });
        helper.fs.createFile(
          'utils',
          'is-string-es6.js',
          "import isType from './is-type-es6.js'; export default function isString() { return isType() +  ' and got is-string'; };"
        );
        helper.command.addComponent('utils/is-string-es6.js', { i: 'utils/is-string-es6' });
        helper.fs.createFile(
          'bar',
          'foo-es6.js',
          "import isString from '../utils/is-string-es6.js'; export default function foo() { return isString() + ' and got foo'; };"
        );
        helper.command.addComponent('bar/foo-es6.js', { i: 'bar/foo-es6' });

        helper.command.tagAllComponents();
        helper.command.exportAllComponents(scopeId);
        componentTestId = `${scopeId}/bar/foo`;
      });
  });
  after(() => {
    return bitsrcTester.deleteScope(scopeName);
  });
  describe('when saveDependenciesAsComponents is the default (FALSE) in consumer bit.json', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.command.runCmd(`bit import ${componentTestId}`);
    });
    it('should not save the dependencies as bit components inside the component directory', () => {
      expect(path.join(helper.scopes.localPath, 'components', '.dependencies')).to.not.be.a.path();
    });
    it('should not write the dependencies in bit.map', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property(`${scopeId}/bar/foo@0.0.1`);
      expect(bitMap).to.not.have.property(`${scopeId}/utils/is-string@0.0.1`);
      expect(bitMap).to.not.have.property(`${scopeId}/utils/is-type@0.0.1`);
    });
    it('should install the dependencies as npm packages', () => {
      expect(path.join(barFooDir, 'node_modules', '@bit', `${scopeId}.utils.is-string`, 'is-string.js')).to.be.a.path();
      expect(path.join(barFooDir, 'node_modules', '@bit', `${scopeId}.utils.is-type`, 'is-type.js')).to.be.a.path();
    });
    it('should generate all the links correctly and print results from all dependencies', () => {
      const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo());";
      fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
      const result = helper.command.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
    it('should recognize the npm packages as dependencies when loading from the file system', () => {
      const showOutput = helper.command.showComponentParsed();
      expect(showOutput.dependencies[0].id).to.equal(`${scopeId}/utils/is-string@0.0.1`);
    });
    it("bit status should not show the component (because it's not new/modified/staged etc)", () => {
      const output = helper.command.runCmd('bit status');
      expect(output.includes('bar/foo')).to.be.false;
    });
    it('should save the package name with the binding-prefix', () => {
      const barFooPackageJson = helper.packageJson.read(path.join(helper.scopes.localPath, 'components', 'bar', 'foo'));
      expect(barFooPackageJson.name).to.equal(`@bit/${scopeId}.bar.foo`);
    });
    it('should save the imported component as a dependency in the package.json of the project', () => {
      const barFooPackageJson = helper.packageJson.read();
      expect(barFooPackageJson.dependencies).to.deep.include({
        [`@bit/${scopeId}.bar.foo`]: 'file:./components/bar/foo',
      });
    });
  });
  describe('when saveDependenciesAsComponents is set to TRUE in consumer bit.json', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      helper.bitJson.modifyField('saveDependenciesAsComponents', true);
      helper.command.runCmd(`bit import ${componentTestId}`);
    });
    it('should save the dependencies as bit components inside the component directory', () => {
      expect(path.join(helper.scopes.localPath, 'components', '.dependencies')).to.be.a.path();
    });
    it('should write the dependencies in bit.map', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property(`${scopeId}/bar/foo@0.0.1`);
      expect(bitMap).to.have.property(`${scopeId}/utils/is-string@0.0.1`);
      expect(bitMap).to.have.property(`${scopeId}/utils/is-type@0.0.1`);
    });
    it('package.json should not contain the dependency', () => {
      const packageJson = helper.packageJson.read(barFooDir);
      expect(packageJson.dependencies).to.deep.equal({});
    });
    it('should generate all the links correctly and print results from all dependencies', () => {
      const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo());";
      fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
      const result = helper.command.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
  });
  describe('ES6 component', () => {
    let componentES6TestId;
    describe('without --ignore-flag flag', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        componentES6TestId = `${scopeId}/bar/foo-es6`;
        helper.command.runCmd(`bit import ${componentES6TestId} `);
      });
      it('should generate all the links in the dists dir correctly and print results from all dependencies', () => {
        const appJsFixture = "const barFoo = require('./components/bar/foo-es6'); console.log(barFoo());";
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
    });
    describe('with --ignore-dist flag and running bit build afterwards', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.command.runCmd(`bit import ${componentES6TestId} --ignore-dist`);
        helper.command.build('bar/foo-es6');
      });
      it('should generate all the links in the dists dir correctly and print results from all dependencies', () => {
        const appJsFixture = "const barFoo = require('./components/bar/foo-es6'); console.log(barFoo());";
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
    });
  });
  describe('importing a component as a dependency of other component and then importing it directly', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.command.runCmd(`bit import ${scopeId}/utils/is-string`); // is-string imports is-type as a dependency
      helper.command.runCmd(`bit import ${scopeId}/utils/is-type`); // import is-type directly

      const appJsFixture = "const isString = require('./components/utils/is-string'); console.log(isString());";
      fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
    });
    it('should update the package.json of the dependent with relative-path of the dependency', () => {
      const isStringDir = path.join(helper.scopes.localPath, 'components', 'utils', 'is-string');
      const packageJsonIsString = helper.packageJson.read(isStringDir);
      expect(packageJsonIsString.dependencies[`@bit/${scopeId}.utils.is-type`]).to.equal('file:../is-type');
    });
    describe('changing the directly imported dependency component', () => {
      before(() => {
        helper.fs.createFile(path.join('components', 'utils', 'is-type'), 'is-type.js', fixtures.isTypeV2);
      });
      it('should affect its dependent', () => {
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type v2 and got is-string');
      });
      describe('As publisher, change to absolute syntax, another, non-bit user clones the project', () => {
        before(() => {
          const isStringFixtureV2 = `const isType = require('@bit/${scopeId}.utils.is-type');
module.exports = function isString() { return isType() +  ' and got is-string'; };`;
          helper.fs.createFile(path.join('components', 'utils', 'is-string'), 'is-string.js', isStringFixtureV2);
        });
        describe('and run install using NPM', () => {
          before(() => {
            helper.git.mimicGitCloneLocalProject();
            helper.command.runCmd('npm install');
          });
          it("that user should see the updated version of the component, same as the publisher, although it doesn't have bit installed ", () => {
            const result = helper.command.runCmd('node app.js');
            expect(result.trim()).to.equal('got is-type v2 and got is-string');
          });
        });
        describe('and run install Yarn', () => {
          before(() => {
            helper.git.mimicGitCloneLocalProject();
            helper.command.runCmd('yarn');
          });
          it("that user should see the updated version of the component, same as the publisher, although it doesn't have bit installed ", () => {
            const result = helper.command.runCmd('node app.js');
            expect(result.trim()).to.equal('got is-type v2 and got is-string');
          });
        });
      });
    });
  });
  describe('importing a component directly and then as a dependency of other component', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.command.runCmd(`bit import ${scopeId}/utils/is-type`); // import is-type directly
      helper.command.runCmd(`bit import ${scopeId}/utils/is-string`); // is-string imports is-type as a dependency
    });
    describe('changing the directly imported dependency component', () => {
      before(() => {
        helper.fs.createFile(path.join('components', 'utils', 'is-type'), 'is-type.js', fixtures.isTypeV2);
      });
      it('should update the package.json of the dependent with relative-path of the dependency', () => {
        const isStringDir = path.join(helper.scopes.localPath, 'components', 'utils', 'is-string');
        const packageJsonIsString = helper.packageJson.read(isStringDir);
        expect(packageJsonIsString.dependencies[`@bit/${scopeId}.utils.is-type`]).to.equal('file:../is-type');
      });
      it('should affect its dependent', () => {
        const appJsFixture = "const isString = require('./components/utils/is-string'); console.log(isString());";
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type v2 and got is-string');
      });
    });
  });
  describe('importing a component with multiple versions and its dependency directly', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.command.runCmd(`bit import ${scopeId}/utils/is-string`);
      helper.command.tagComponent('utils/is-string', 'v2', '-f');
      helper.command.exportAllComponents(scopeId);

      helper.scopeHelper.reInitLocalScope();
      helper.command.runCmd(`bit import ${scopeId}/utils/is-string`); // 0.0.2
      helper.command.runCmd(`bit import ${scopeId}/utils/is-type`);
    });
    describe('importing the dependent as a different version', () => {
      let output;
      before(() => {
        output = helper.command.runCmd(`bit import ${scopeId}/utils/is-string@0.0.1`);
      });
      it('should import the component successfully with no errors', () => {
        expect(output).to.have.string('successfully imported');
      });
    });
  });
  describe('installing as a package and then importing it', () => {
    let packageJsonBeforeImport;
    let packageJsonAfterImport;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.command.runCmd('npm init -y');
      helper.command.runCmd(`npm i @bit/${scopeId}.utils.is-type --save`);
      packageJsonBeforeImport = helper.packageJson.read();
      helper.command.runCmd(`bit import ${scopeId}/utils/is-type`);
      packageJsonAfterImport = helper.packageJson.read();
    });
    it('should not remove any property of the package.json created by npm', () => {
      Object.keys(packageJsonBeforeImport).forEach((prop) => expect(packageJsonAfterImport).to.have.property(prop));
    });
    it('should update the root package.json and change the dependency from a package to a local path', () => {
      expect(packageJsonBeforeImport.dependencies[`@bit/${scopeId}.utils.is-type`]).to.equal('0.0.1');
      expect(packageJsonAfterImport.dependencies[`@bit/${scopeId}.utils.is-type`]).to.equal(
        'file:./components/utils/is-type'
      );
    });
  });
  describe('importing a component when its dependency is authored', () => {
    let output;
    before(() => {
      helper.scopeHelper.getClonedLocalScope(scopeAfterExport);

      let removeOutput = helper.command.removeComponent('bar/foo', '--delete-files');
      expect(removeOutput).to.have.string('successfully removed');
      removeOutput = helper.command.removeComponent('utils/is-string', '--delete-files');
      expect(removeOutput).to.have.string('successfully removed');

      output = helper.command.runCmd(`bit import ${scopeId}/utils/is-string`);
    });
    it('should not throw an error when importing', () => {
      expect(output).to.have.string('successfully imported one component');
    });
    it('should generate the links to the authored component successfully', () => {
      const run = () => helper.command.runCmd(`node ${path.normalize('components/utils/is-string/is-string.js')}`);
      expect(run).not.to.throw();
    });
  });
});
