import chai, { expect } from 'chai';
import path from 'path';
import fs from 'fs-extra';
import Helper from '../e2e-helper';
import BitsrcTester, { username, supportTestingOnBitsrc } from '../bitsrc-tester';
import * as fixtures from '../fixtures/fixtures';
import { BASE_WEB_DOMAIN } from '../../src/constants';

chai.use(require('chai-fs'));

(supportTestingOnBitsrc ? describe : describe.skip)(`importing bit components from ${BASE_WEB_DOMAIN}`, function () {
  this.timeout(0);
  const helper = new Helper();
  const bitsrcTester = new BitsrcTester();
  const barFooDir = path.join(helper.localScopePath, 'components', 'bar', 'foo');
  let scopeName;
  let scopeId;
  let componentTestId;
  let scopeAfterExport;
  before(() => {
    return bitsrcTester
      .loginToBitSrc()
      .then(() => bitsrcTester.createScope())
      .then((scope) => {
        scopeName = scope;
        scopeId = `${username}.${scopeName}`;
        helper.reInitLocalScope();
        helper.createFile('utils', 'is-type.js', fixtures.isType);
        helper.addComponentUtilsIsType();
        helper.createFile('utils', 'is-string.js', fixtures.isString);
        helper.addComponentUtilsIsString();
        helper.createComponentBarFoo(fixtures.barFooFixture);
        helper.addComponentBarFoo();
        helper.tagAllComponents();
        helper.exportAllComponents(scopeId);
        scopeAfterExport = helper.cloneLocalScope();

        helper.reInitLocalScope();
        helper.importCompiler('bit.envs/compilers/babel@0.0.20');
        helper.createFile('utils', 'is-type-es6.js', fixtures.isTypeES6);
        helper.addComponent('utils/is-type-es6.js', { i: 'utils/is-type-es6' });
        helper.createFile(
          'utils',
          'is-string-es6.js',
          "import isType from './is-type-es6.js'; export default function isString() { return isType() +  ' and got is-string'; };"
        );
        helper.addComponent('utils/is-string-es6.js', { i: 'utils/is-string-es6' });
        helper.createFile(
          'bar',
          'foo-es6.js',
          "import isString from '../utils/is-string-es6.js'; export default function foo() { return isString() + ' and got foo'; };"
        );
        helper.addComponent('bar/foo-es6.js', { i: 'bar/foo-es6' });

        helper.tagAllComponents();
        helper.exportAllComponents(scopeId);
        componentTestId = `${scopeId}/bar/foo`;
      });
  });
  after(() => {
    return bitsrcTester.deleteScope(scopeName);
  });
  describe('when saveDependenciesAsComponents is the default (FALSE) in consumer bit.json', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.runCmd(`bit import ${componentTestId}`);
    });
    it('should not save the dependencies as bit components inside the component directory', () => {
      expect(path.join(helper.localScopePath, 'components', '.dependencies')).to.not.be.a.path();
    });
    it('should not write the dependencies in bit.map', () => {
      const bitMap = helper.readBitMap();
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
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
    it('should recognize the npm packages as dependencies when loading from the file system', () => {
      const showOutput = helper.showComponentParsed();
      expect(showOutput.dependencies[0].id).to.equal(`${scopeId}/utils/is-string@0.0.1`);
    });
    it("bit status should not show the component (because it's not new/modified/staged etc)", () => {
      const output = helper.runCmd('bit status');
      expect(output.includes('bar/foo')).to.be.false;
    });
    it('should save the package name with the binding-prefix', () => {
      const barFooPackageJson = helper.readPackageJson(path.join(helper.localScopePath, 'components', 'bar', 'foo'));
      expect(barFooPackageJson.name).to.equal(`@bit/${scopeId}.bar.foo`);
    });
    it('should save the imported component as a dependency in the package.json of the project', () => {
      const barFooPackageJson = helper.readPackageJson();
      expect(barFooPackageJson.dependencies).to.deep.include({
        [`@bit/${scopeId}.bar.foo`]: 'file:./components/bar/foo'
      });
    });
  });
  describe('when saveDependenciesAsComponents is set to TRUE in consumer bit.json', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.modifyFieldInBitJson('saveDependenciesAsComponents', true);
      helper.runCmd(`bit import ${componentTestId}`);
    });
    it('should save the dependencies as bit components inside the component directory', () => {
      expect(path.join(helper.localScopePath, 'components', '.dependencies')).to.be.a.path();
    });
    it('should write the dependencies in bit.map', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property(`${scopeId}/bar/foo@0.0.1`);
      expect(bitMap).to.have.property(`${scopeId}/utils/is-string@0.0.1`);
      expect(bitMap).to.have.property(`${scopeId}/utils/is-type@0.0.1`);
    });
    it('package.json should not contain the dependency', () => {
      const packageJson = helper.readPackageJson(barFooDir);
      expect(packageJson.dependencies).to.deep.equal({});
    });
    it('should generate all the links correctly and print results from all dependencies', () => {
      const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
  });
  describe('ES6 component', () => {
    let componentES6TestId;
    describe('without --ignore-flag flag', () => {
      before(() => {
        helper.reInitLocalScope();
        componentES6TestId = `${scopeId}/bar/foo-es6`;
        helper.runCmd(`bit import ${componentES6TestId} `);
      });
      it('should generate all the links in the dists dir correctly and print results from all dependencies', () => {
        const appJsFixture = "const barFoo = require('./components/bar/foo-es6'); console.log(barFoo());";
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
    });
    describe('with --ignore-dist flag and running bit build afterwards', () => {
      before(() => {
        helper.reInitLocalScope();
        helper.runCmd(`bit import ${componentES6TestId} --ignore-dist`);
        helper.build('bar/foo-es6');
      });
      it('should generate all the links in the dists dir correctly and print results from all dependencies', () => {
        const appJsFixture = "const barFoo = require('./components/bar/foo-es6'); console.log(barFoo());";
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
    });
  });
  describe('importing a component as a dependency of other component and then importing it directly', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.runCmd(`bit import ${scopeId}/utils/is-string`); // is-string imports is-type as a dependency
      helper.runCmd(`bit import ${scopeId}/utils/is-type`); // import is-type directly

      const appJsFixture = "const isString = require('./components/utils/is-string'); console.log(isString());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
    });
    it('should update the package.json of the dependent with relative-path of the dependency', () => {
      const isStringDir = path.join(helper.localScopePath, 'components', 'utils', 'is-string');
      const packageJsonIsString = helper.readPackageJson(isStringDir);
      expect(packageJsonIsString.dependencies[`@bit/${scopeId}.utils.is-type`]).to.equal('file:../is-type');
    });
    describe('changing the directly imported dependency component', () => {
      before(() => {
        const isTypeFixtureV2 = "module.exports = function isType() { return 'got is-type v2'; };";
        helper.createFile(path.join('components', 'utils', 'is-type'), 'is-type.js', isTypeFixtureV2);
      });
      it('should affect its dependent', () => {
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type v2 and got is-string');
      });
      describe('As publisher, change to absolute syntax, another, non-bit user clones the project', () => {
        before(() => {
          const isStringFixtureV2 = `const isType = require('@bit/${scopeId}.utils.is-type');
module.exports = function isString() { return isType() +  ' and got is-string'; };`;
          helper.createFile(path.join('components', 'utils', 'is-string'), 'is-string.js', isStringFixtureV2);
        });
        describe('and run install using NPM', () => {
          before(() => {
            helper.mimicGitCloneLocalProject();
            helper.runCmd('npm install');
          });
          it("that user should see the updated version of the component, same as the publisher, although it doesn't have bit installed ", () => {
            const result = helper.runCmd('node app.js');
            expect(result.trim()).to.equal('got is-type v2 and got is-string');
          });
        });
        describe('and run install Yarn', () => {
          before(() => {
            helper.mimicGitCloneLocalProject();
            helper.runCmd('yarn');
          });
          it("that user should see the updated version of the component, same as the publisher, although it doesn't have bit installed ", () => {
            const result = helper.runCmd('node app.js');
            expect(result.trim()).to.equal('got is-type v2 and got is-string');
          });
        });
      });
    });
  });
  describe('importing a component directly and then as a dependency of other component', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.runCmd(`bit import ${scopeId}/utils/is-type`); // import is-type directly
      helper.runCmd(`bit import ${scopeId}/utils/is-string`); // is-string imports is-type as a dependency
    });
    describe('changing the directly imported dependency component', () => {
      before(() => {
        const isTypeFixtureV2 = "module.exports = function isType() { return 'got is-type v2'; };";
        helper.createFile(path.join('components', 'utils', 'is-type'), 'is-type.js', isTypeFixtureV2);
      });
      it('should update the package.json of the dependent with relative-path of the dependency', () => {
        const isStringDir = path.join(helper.localScopePath, 'components', 'utils', 'is-string');
        const packageJsonIsString = helper.readPackageJson(isStringDir);
        expect(packageJsonIsString.dependencies[`@bit/${scopeId}.utils.is-type`]).to.equal('file:../is-type');
      });
      it('should affect its dependent', () => {
        const appJsFixture = "const isString = require('./components/utils/is-string'); console.log(isString());";
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type v2 and got is-string');
      });
    });
  });
  describe('importing a component with multiple versions and its dependency directly', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.runCmd(`bit import ${scopeId}/utils/is-string`);
      helper.tagComponent('utils/is-string', 'v2', '-f');
      helper.exportAllComponents(scopeId);

      helper.reInitLocalScope();
      helper.runCmd(`bit import ${scopeId}/utils/is-string`); // 0.0.2
      helper.runCmd(`bit import ${scopeId}/utils/is-type`);
    });
    describe('importing the dependent as a different version', () => {
      let output;
      before(() => {
        output = helper.runCmd(`bit import ${scopeId}/utils/is-string@0.0.1`);
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
      helper.reInitLocalScope();
      helper.runCmd('npm init -y');
      helper.runCmd(`npm i @bit/${scopeId}.utils.is-type --save`);
      packageJsonBeforeImport = helper.readPackageJson();
      helper.runCmd(`bit import ${scopeId}/utils/is-type`);
      packageJsonAfterImport = helper.readPackageJson();
    });
    it('should not remove any property of the package.json created by npm', () => {
      Object.keys(packageJsonBeforeImport).forEach(prop => expect(packageJsonAfterImport).to.have.property(prop));
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
      helper.getClonedLocalScope(scopeAfterExport);

      let removeOutput = helper.removeComponent('bar/foo', '--delete-files --silent');
      expect(removeOutput).to.have.string('successfully removed');
      removeOutput = helper.removeComponent('utils/is-string', '--delete-files --silent');
      expect(removeOutput).to.have.string('successfully removed');

      output = helper.runCmd(`bit import ${scopeId}/utils/is-string`);
    });
    it('should not throw an error when importing', () => {
      expect(output).to.have.string('successfully imported one component');
    });
    it('should generate the links to the authored component successfully', () => {
      const run = () => helper.runCmd(`node ${path.normalize('components/utils/is-string/is-string.js')}`);
      expect(run).not.to.throw();
    });
  });
});
