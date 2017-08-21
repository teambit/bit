// covers also init, create, commit commands and the js-doc parser

import { expect } from 'chai';
import path from 'path';
import Helper, { VERSION_DELIMITER } from '../e2e-helper';

describe('bit show command', function () {
  this.timeout(0);
  const helper = new Helper();

  after(() => {
    helper.destroyEnv();
  });

  describe('local component', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.reInitRemoteScope();
      helper.addRemoteScope();
      helper.importCompiler();

      helper.createComponent('utils', 'is-string.js');
      helper.addComponent('utils/is-string.js');
      helper.commitComponent('utils/is-string');

      const lodashGetPackageJsonFixture = JSON.stringify({
        name: 'lodash.get',
        version: '4.4.2'
      });
      helper.createFile('node_modules/lodash.get', 'index.js');
      helper.createFile('node_modules/lodash.get', 'package.json', lodashGetPackageJsonFixture);

      const fooBarFixture = "const isString = require('../utils/is-string.js'); const get = require('lodash.get'); module.exports = function foo() { return isString() + ' and got foo'; };";
      helper.createFile('src', 'mainFile.js', fooBarFixture);
      helper.createFile('src/utils', 'utilFile.js');
      helper.runCmd('bit add src/mainFile.js src/utils/utilFile.js -i comp/comp -m src/mainFile.js');
      helper.commitComponent('comp/comp');
    });

    describe('single version as cli output (no -v or -j flags)', () => {
      let output;

      before(() => {
        output = helper.runCmd(`bit show comp/comp`);
      });

      it('should render the id correctly', () => {
        expect(output).to.have.string('ID', 'ID row is missing');
        expect(output).to.have.string('comp/comp', 'component id is wrong');
      });

      it('should render the compiler correctly', () => {
        expect(output).to.have.string('Compiler', 'Compiler row is missing');
        expect(output).to.have.string(`${helper.envScope}/compilers/babel`, 'compiler is wrong');
      });

      it('should render the language correctly', () => {
        expect(output).to.have.string('Language', 'Language row is missing');
        expect(output).to.have.string('javascript', 'Language is wrong');
      });

      it.skip('should render the tester correctly', () => {
        expect(output).to.have.string('Tester', 'Tester row is missing');
        expect(output).to.have.string('javascript', 'Tester is wrong');
      });

      it('should render the main file correctly', () => {
        expect(output).to.have.string('Main file', 'Main file row is missing');
        expect(output).to.have.string(path.normalize('src/mainFile.js'), 'Main file is wrong');
      });

      it('should render the dependencies correctly', () => {
        expect(output).to.have.string('Dependencies', 'Dependencies row is missing');
        // TODO: Should be concrete version after we resolve the dep version
        expect(output).to.have.string(`utils/is-string`, 'Dependencies are wrong');
      });

      it('should render the package dependencies correctly', () => {
        expect(output).to.have.string('Packages', 'Packages row is missing');
        expect(output).to.have.string('lodash.get', 'Packages are wrong');
      });

      it('should render the files correctly', () => {
        expect(output).to.have.string('Files', 'Files row is missing');
        expect(output).to.have.string(path.normalize('src/mainFile.js'), 'Files are wrong');
        expect(output).to.have.string(path.normalize('src/utils/utilFile.js'), 'Files are wrong');
      });

      it('should render the main file correctly', () => {
        expect(output).to.have.string('Main file', 'Main file row is missing');
        expect(output).to.have.string(path.normalize('src/mainFile.js'), 'Main file is wrong');
      });
    });

    describe('single version as json output', () => {
      let output;


      before(() => {
        output = JSON.parse(helper.runCmd(`bit show comp/comp -j`));
      })

      it('should include the name correctly', () => {
        expect(output).to.include({name: 'comp'});
      });

      it('should include the namespace correctly', () => {
        expect(output).to.include({box: 'comp'});
      });

      // TODO: Check again after this commit merged: 6ee69fab36f5b9f31fa576216c6bf22808d0d459
      it.skip('should include the version correctly', () => {
        expect(output).to.include({version: 1});
      });

      // TODO: get the version dynamically
      it('should include the compiler correctly', () => {
        expect(output).to.include({compilerId: `${helper.envScope}/compilers/babel${VERSION_DELIMITER}1`});
      });

      it('should include the language correctly', () => {
        expect(output).to.include({lang: "javascript"});
      });

      // TODO: update when we add tester to use case
      it('should include the tester correctly', () => {
        expect(output).to.include({testerId: null});
      });

      it('should render the main file correctly', () => {
        expect(output).to.include({mainFile: path.normalize('src/mainFile.js')});
      });

      it('should include the dependencies correctly', () => {
        const dependencies = output.dependencies;
        console.log('dependencies', JSON.stringify(dependencies));
        // TODO: Should be concrete version after we resolve the dep version
        const depPaths = [{ sourceRelativePath: path.normalize('utils/is-string.js'), destinationRelativePath: path.normalize('utils/is-string.js') }];
        const depObject = { id: 'utils/is-string', relativePaths: depPaths };
        expect(dependencies[0].relativePaths[0]).to.include(depPaths[0]);
      });

      // TODO: update when adding package deps to test case
      it('should include the package dependencies correctly', () => {
        const packageDependencies = output.packageDependencies;
        const depObject = { 'lodash.get': '4.4.2' };
        expect(packageDependencies).to.include(depObject);
      });

      it('should include the files correctly', () => {
        const files = output.files;
        const firstFileObj = files[0];
        const secondFileObj = files[1];

        const mainFileHistory = [path.normalize(`${helper.localScopePath}/src/mainFile.js`)];
        // const mainFileObj = {history: mainFileHistory};
        const utilFileHistory = [path.normalize(`${helper.localScopePath}/src/utils/utilFile.js`)];
        // const utilFileObj = {history: utilFileHistory};

        expect(firstFileObj.history[0]).to.include(mainFileHistory);
        expect(secondFileObj.history[0]).to.include(utilFileHistory);
      });

      // TODO: change this to src/mainFile.js once we change the main file to store relative instead of path
      it('should include the main file correctly', () => {
        expect(output).to.include({ mainFile: path.normalize('src/mainFile.js') });
      });
    });

    it.skip('should throw an error if the -v flag provided', () => {

    });
  });

  // TODO: Implement after export is working
  describe.skip('remote components', () => {
    describe('single version as cli output (no -v or -j flags)', () => {
      it('should render the id correctly', () => {

      });

      it('should render the language correctly', () => {

      });

      it('should render the language correctly', () => {

      });

      it('should render the tester correctly', () => {

      });

      it('should render the dependencies correctly', () => {

      });

      it('should render the package dependencies correctly', () => {

      });

      it('should render the files correctly', () => {
        expect(output).to.have.string('Files', 'Files row is missing');
        expect(output).to.have.string('src/mainFile.js', 'Files are wrong');
        expect(output).to.have.string('src/utils/utilFile.js', 'Files are wrong');
      });

      it.skip('should render the main file correctly', () => {
        expect(output).to.have.string('Main file', 'Main file row is missing');
        expect(output).to.have.string('src/mainFile.js', 'Main file is wrong');
      });
    });

    describe('all versions as cli output (without -j flag)', () => {
      it('should render the id correctly', () => {

      });

      it('should render the language correctly', () => {

      });

      it('should render the language correctly', () => {

      });

      it('should render the tester correctly', () => {

      });

      it('should render the dependencies correctly', () => {

      });

      it('should render the package dependencies correctly', () => {

      });
    });

    describe('single version as json output', () => {
      // TODO: Make more test cases here
      it('should return correct json', () => {

      });
    });

    describe('all versions as json output', () => {
      // TODO: Make more test cases here
      it('should return correct json', () => {

      });
    });
  });

  describe.skip('with no docs', () => {
    before(() => {
      const fooComponentFixture = "module.exports = function foo() { return 'got foo'; };";
      commitFoo(fooComponentFixture);
    });
    it('should display "No documentation found" when there is no documentation', () => {
      const output = helper.runCmd('bit show bar/foo');
      expect(output.includes('No documentation found')).to.be.true;
    });
    it('should not show the "description" field', () => {
      const output = helper.runCmd('bit show bar/foo');
      expect(output.includes('Description')).to.be.false;
    });
  });
  describe.skip('with docs', () => {
    before(() => {
      const fooComponentFixture = `/**
 * Adds two numbers.
 * @name add
 * @param {number} a The first number in an addition.
 * @param {number} b The second number in an addition.
 * @returns {number} Returns the total.
 */
function add(a, b) {
  return a+b;
}`;
      commitFoo(fooComponentFixture);
    });
    it('should parse the documentation correctly', () => {
      const output = helper.runCmd('bit show bar/foo');
      expect(output.includes('No documentation found')).to.be.false;
      expect(output.includes('Description')).to.be.true;
      expect(output.includes('Adds two numbers.')).to.be.true;
      expect(output.includes('Args')).to.be.true;
      expect(output.includes('Returns')).to.be.true;
      expect(output.includes('number -> Returns the total.')).to.be.true;
    });
  });
});
