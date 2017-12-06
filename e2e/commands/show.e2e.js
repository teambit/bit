// covers also init, create, commit commands and the js-doc parser

import chai, { expect } from 'chai';
import path from 'path';
import Helper, { VERSION_DELIMITER } from '../e2e-helper';

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('bit show command', function () {
  this.timeout(0);
  const helper = new Helper();

  after(() => {
    helper.destroyEnv();
  });

  describe('local component', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.importCompiler();

      helper.createComponent('utils', 'is-string.js');
      helper.addComponent('utils/is-string.js');
      helper.commitComponent('utils/is-string');

      helper.addNpmPackage();

      const fooBarFixture =
        "const isString = require('../utils/is-string.js'); const get = require('lodash.get'); module.exports = function foo() { return isString() + ' and got foo'; };";
      helper.createFile('src', 'mainFile.js', fooBarFixture);
      helper.createFile('src/utils', 'utilFile.js');
      helper.runCmd('bit add src/mainFile.js src/utils/utilFile.js -i comp/comp -m src/mainFile.js');
      helper.commitComponent('comp/comp');
    });

    describe('show deprecated local component', () => {
      let output;
      it('should not show deprecated component if not deprecated ', () => {
        output = helper.runCmd('bit show comp/comp');
        expect(output).to.not.include('Deprecated');
      });

      it('should show deprecated component', () => {
        output = JSON.parse(helper.runCmd('bit show comp/comp -j'));
        expect(output).to.include({ deprecated: false });
      });
      it('should show deprecated component', () => {
        helper.deprecateComponent('comp/comp');
        output = JSON.parse(helper.runCmd('bit show comp/comp -j'));
        expect(output).to.include({ deprecated: true });
      });
      it('should show local deprecated component without -j', () => {
        helper.deprecateComponent('comp/comp');
        output = helper.runCmd('bit show comp/comp');
        expect(output).to.include('Deprecated');
      });
    });

    describe('single version as cli output (no -v or -j flags)', () => {
      let output;

      before(() => {
        output = helper.runCmd('bit show comp/comp');
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
        expect(output).to.have.string('Main File', 'Main file row is missing');
        expect(output).to.have.string('src/mainFile.js', 'Main file is wrong');
      });

      it('should render the dependencies correctly', () => {
        expect(output).to.have.string('Dependencies', 'Dependencies row is missing');
        // TODO: Should be concrete version after we resolve the dep version
        expect(output).to.have.string('utils/is-string', 'Dependencies are wrong');
      });

      it('should render the package dependencies correctly', () => {
        expect(output).to.have.string('Packages', 'Packages row is missing');
        expect(output).to.have.string('lodash.get', 'Packages are wrong');
      });

      it('should render the files correctly', () => {
        expect(output).to.have.string('Files', 'Files row is missing');
        expect(output).to.have.string('src/mainFile.js', 'Files are wrong');
        expect(output).to.have.string('src/utils/utilFile.js', 'Files are wrong');
      });

      it('should render the main file correctly', () => {
        expect(output).to.have.string('Main File', 'Main file row is missing');
        expect(output).to.have.string('src/mainFile.js', 'Main file is wrong');
      });
    });

    describe('single version as json output', () => {
      let output;

      before(() => {
        output = JSON.parse(helper.runCmd('bit show comp/comp -j'));
      });

      it('should include the name correctly', () => {
        expect(output).to.include({ name: 'comp' });
      });

      it('should include the namespace correctly', () => {
        expect(output).to.include({ box: 'comp' });
      });

      // TODO: Check again after this commit merged: 6ee69fab36f5b9f31fa576216c6bf22808d0d459
      it.skip('should include the version correctly', () => {
        expect(output).to.include({ version: 1 });
      });

      // TODO: get the version dynamically
      it('should include the compiler correctly', () => {
        expect(output).to.include({ compilerId: `${helper.envScope}/compilers/babel${VERSION_DELIMITER}0.0.1` });
      });

      it('should include the language correctly', () => {
        expect(output).to.include({ lang: 'javascript' });
      });

      // TODO: update when we add tester to use case
      it('should include the tester correctly', () => {
        expect(output).to.include({ testerId: null });
      });

      it('should render the main file correctly', () => {
        expect(output).to.include({ mainFile: 'src/mainFile.js' });
      });

      it('should include the dependencies correctly', () => {
        const dependencies = output.dependencies;
        // TODO: Should be concrete version after we resolve the dep version
        const depPaths = [{ sourceRelativePath: 'utils/is-string.js', destinationRelativePath: 'utils/is-string.js' }];
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

        // path.pathNormalizeToLinux is used because the test check the vinyl objects
        expect(firstFileObj.relativePath).to.include(path.normalize('src/mainFile.js'));
        expect(secondFileObj.relativePath).to.include(path.normalize('src/utils/utilFile.js'));
      });

      // TODO: change this to src/mainFile.js once we change the main file to store relative instead of path
      it('should include the main file correctly', () => {
        expect(output).to.include({ mainFile: 'src/mainFile.js' });
      });
    });

    it.skip('should throw an error if the -v flag provided', () => {});
  });

  // TODO: Implement after export is working
  describe.skip('remote components', () => {
    let output;

    describe('single version as cli output (no -v or -j flags)', () => {
      it('should render the id correctly', () => {});

      it('should render the language correctly', () => {});

      it('should render the language correctly', () => {});

      it('should render the tester correctly', () => {});

      it('should render the dependencies correctly', () => {});

      it('should render the package dependencies correctly', () => {});

      it('should render the files correctly', () => {
        expect(output).to.have.string('Files', 'Files row is missing');
        expect(output).to.have.string('src/mainFile.js', 'Files are wrong');
        expect(output).to.have.string('src/utils/utilFile.js', 'Files are wrong');
      });

      it.skip('should render the main file correctly', () => {
        expect(output).to.have.string('Main File', 'Main file row is missing');
        expect(output).to.have.string('src/mainFile.js', 'Main file is wrong');
      });
    });
    describe('all versions as cli output (without -j flag)', () => {
      it('should render the id correctly', () => {});

      it('should render the language correctly', () => {});

      it('should render the language correctly', () => {});

      it('should render the tester correctly', () => {});

      it('should render the dependencies correctly', () => {});

      it('should render the package dependencies correctly', () => {});
    });

    describe('single version as json output', () => {
      // TODO: Make more test cases here
      it('should return correct json', () => {});
    });

    describe('all versions as json output', () => {
      // TODO: Make more test cases here
      it('should return correct json', () => {});
    });
  });

  describe('show deprecated remote component', () => {
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.exportAllComponents();
    });
    it('should show deprecated component', () => {
      helper.deprecateComponent(`${helper.remoteScope}/bar/foo`, '-r');
      output = JSON.parse(helper.runCmd(`bit show ${helper.remoteScope}/bar/foo -j`));
      expect(output).to.include({ deprecated: true });
    });
  });
  describe('show deprecated remote component', () => {
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.exportAllComponents();
    });
    it('should show regular component', () => {
      output = JSON.parse(helper.runCmd(`bit show ${helper.remoteScope}/bar/foo -j`));
      expect(output).to.include({ deprecated: false });
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
  describe('local component', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.importCompiler();

      helper.createComponent('utils', 'is-string.js');
      helper.addComponent('utils/is-string.js');
      helper.commitComponent('utils/is-string');
    });

    it('Should not show component if bit.json is corrupted', () => {
      helper.corruptBitJson();
      const showCmd = () => helper.runCmd('bit show comp/comp -j');
      expect(showCmd).to.throw(
        'error: invalid bit.json: SyntaxError: Unexpected token o in JSON at position 1 is not a valid JSON file.'
      );
    });
  });
  describe('with removed file/files', () => {
    beforeEach(() => {
      helper.initNewLocalScope();
      helper.createComponentBarFoo();
      helper.createComponent('bar', 'index.js');
      helper.addComponentWithOptions('bar/', { i: 'bar/foo' });
    });
    it('Should show component only with the left files', () => {
      const beforeRemoveBitMap = helper.readBitMap();
      const beforeRemoveBitMapfiles = beforeRemoveBitMap['bar/foo'].files;
      expect(beforeRemoveBitMapfiles).to.be.ofSize(2);
      helper.deleteFile('bar/foo.js');
      const output = helper.showComponent('bar/foo -j');
      const bitMap = helper.readBitMap();
      const files = bitMap['bar/foo'].files;
      expect(files).to.be.ofSize(1);
      expect(files[0].name).to.equal('index.js');
      expect(JSON.parse(output).files).to.be.ofSize(1);
    });
    it('Should throw error that all files were removed', () => {
      const beforeRemoveBitMap = helper.readBitMap();
      const beforeRemoveBitMapfiles = beforeRemoveBitMap['bar/foo'].files;
      expect(beforeRemoveBitMapfiles).to.be.ofSize(2);
      helper.deleteFile('bar/index.js');
      helper.deleteFile('bar/foo.js');

      const showCmd = () => helper.showComponent('bar/foo');
      expect(showCmd).to.throw(
        'invalid component bar/foo, all files were deleted, please remove the component using bit remove command\n'
      );
    });
  });
  describe('with --compare flag', () => {
    before(() => {
      helper.initNewLocalScope();
      helper.createComponentBarFoo();
      helper.createComponent('bar', 'index.js');
      helper.addComponentWithOptions('bar/', { i: 'bar/foo' });
    });
    describe('when adding a component without committing it', () => {
      it('Should throw error nothing to compare no previous versions found', () => {
        const showCmd = () => helper.showComponent('bar/foo --compare');
        expect(showCmd).to.throw('error - nothing to compare no previous versions found');
      });
    });
    describe('when importing a component', () => {
      before(() => {
        helper.commitAllComponents();
        helper.reInitRemoteScope();
        helper.addRemoteScope();
        helper.exportAllComponents();
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/foo@0.0.1');
      });
      it('Should not throw an error "nothing to compare no previous versions found"', () => {
        const showCmd = () => helper.showComponent('bar/foo --compare');
        expect(showCmd).not.to.throw();
      });
      it('model and file-system should have the same main file and files, regardless the originallySharedDir (bar)', () => {
        const result = helper.showComponent('bar/foo --compare --json');
        const { componentFromFileSystem, componentFromModel } = JSON.parse(result);
        expect(componentFromFileSystem.mainFile).to.equal(componentFromModel.mainFile);
        expect(componentFromFileSystem.files).to.deep.equal(componentFromModel.files);
      });
    });
  });
  describe('with --outdated flag', () => {
    describe('with a consumer component', () => {
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
        helper.createComponent('utils', 'is-type.js', isTypeFixture);
        helper.addComponent('utils/is-type.js');
        helper.commitComponent('utils/is-type');
        helper.commitComponent('utils/is-type', 'msg', '-f');
        helper.exportAllComponents();

        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('utils/is-type@0.0.1');

        const isStringFixture =
          "const isType = require('bit/utils/is-type'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
        helper.createComponent('utils', 'is-string.js', isStringFixture);
        helper.addComponent('utils/is-string.js');
        helper.commitAllComponents();
      });
      describe('when a component uses an old version of a dependency', () => {
        it('should indicate that the remote version is larger than the current version', () => {
          const output = helper.showComponent('utils/is-string --outdated --json');
          const outputParsed = JSON.parse(output);
          expect(outputParsed.dependencies[0].currentVersion).to.equal('0.0.1');
          expect(outputParsed.dependencies[0].localVersion).to.equal('0.0.2');
          expect(outputParsed.dependencies[0].remoteVersion).to.equal('0.0.2');
        });
      });
      describe('when the dependency was updated locally but not exported yet', () => {
        before(() => {
          helper.commitComponent('utils/is-type', 'msg', '-f');
        });
        it('should indicate that the current version is larger than the remote version', () => {
          const output = helper.showComponent('utils/is-string --outdated --json');
          const outputParsed = JSON.parse(output);
          expect(outputParsed.dependencies[0].currentVersion).to.equal('0.0.3');
          expect(outputParsed.dependencies[0].localVersion).to.equal('0.0.3');
          expect(outputParsed.dependencies[0].remoteVersion).to.equal('0.0.2');
        });
      });
      describe('when the dependency is up to date', () => {
        before(() => {
          helper.exportAllComponents();
        });
        it('should indicate that all versions are the same', () => {
          const output = helper.showComponent('utils/is-string --outdated --json');
          const outputParsed = JSON.parse(output);
          expect(outputParsed.dependencies[0].currentVersion).to.equal('0.0.3');
          expect(outputParsed.dependencies[0].localVersion).to.equal('0.0.3');
          expect(outputParsed.dependencies[0].remoteVersion).to.equal('0.0.3');
        });
      });
    });
    describe('with a scope component', () => {
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
        helper.createComponent('utils', 'is-type.js', isTypeFixture);
        helper.addComponent('utils/is-type.js');
        helper.commitComponent('utils/is-type');
        helper.commitComponent('utils/is-type', 'msg', '-f');
        helper.exportAllComponents();

        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('utils/is-type@0.0.1');

        const isStringFixture =
          "const isType = require('bit/utils/is-type'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
        helper.createComponent('utils', 'is-string.js', isStringFixture);
        helper.addComponent('utils/is-string.js');
        helper.commitAllComponents();
        helper.exportAllComponents();

        helper.reInitLocalScope();
        helper.addRemoteScope();
        // @todo: add a test case before importing the component. Currently there is a bug that it downloads the
        // component into the model in such a case
        helper.importComponent('utils/is-string@0.0.1');
      });
      it('should show the remote and local versions', () => {
        const output = helper.showComponent(`${helper.remoteScope}/utils/is-string --outdated --json`);
        const outputParsed = JSON.parse(output);
        expect(outputParsed.dependencies[0].currentVersion).to.equal('0.0.1');
        expect(outputParsed.dependencies[0].localVersion).to.equal('0.0.2');
        expect(outputParsed.dependencies[0].remoteVersion).to.equal('0.0.2');
      });
    });
  });
});
