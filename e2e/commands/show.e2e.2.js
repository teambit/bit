import chai, { expect } from 'chai';
import path from 'path';
import R from 'ramda';
import Helper, { VERSION_DELIMITER } from '../e2e-helper';
import MissingFilesFromComponent from '../../src/consumer/component/exceptions/missing-files-from-component';

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('bit show command', function () {
  this.timeout(0);
  const helper = new Helper();

  after(() => {
    helper.destroyEnv();
  });
  describe('run before running "bit init" with .bit.map.json', () => {
    it('Should init consumer add then show component', () => {
      helper.createBitMap();
      helper.createFile('bar', 'foo.js');
      const output = helper.showComponent('bar/foo');
      expect(output).to.include('bar/foo');
    });
  });
  describe('local component', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.importCompiler();

      helper.createFile('utils', 'is-string.js');
      helper.addComponentUtilsIsString();
      helper.tagComponent('utils/is-string');

      helper.addNpmPackage();

      const fooBarFixture =
        "const isString = require('../utils/is-string.js'); const get = require('lodash.get'); module.exports = function foo() { return isString() + ' and got foo'; };";
      helper.createFile('src', 'mainFile.js', fooBarFixture);
      helper.createFile('src/utils', 'utilFile.js');
      helper.runCmd('bit add src/mainFile.js src/utils/utilFile.js -i comp/comp -m src/mainFile.js');
      helper.tagComponent('comp/comp');
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
        expect(output).to.have.string('Id', 'Id row is missing');
        expect(output).to.have.string('comp/comp', 'component id is wrong');
      });

      it('should render the compiler correctly', () => {
        expect(output).to.have.string('Compiler', 'Compiler row is missing');
        expect(output).to.have.string(`${helper.envScope}/compilers/babel@0.0.1`, 'compiler is wrong');
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
        expect(output).to.not.have.string('Packages', 'Packages row is missing');
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
        expect(output).to.include({ name: 'comp/comp' });
      });

      it('should include the version correctly', () => {
        expect(output).to.include({ version: '0.0.1' });
      });

      // TODO: get the version dynamically
      it('should include the compiler correctly', () => {
        const outputCompiler = output.compiler;
        expect(outputCompiler.files).to.be.an('array').that.is.empty;
        expect(outputCompiler.config).to.be.an('object').that.is.empty;
        expect(outputCompiler.name).have.string(`${helper.envScope}/compilers/babel${VERSION_DELIMITER}0.0.1`);
      });

      it('should include the language correctly', () => {
        expect(output).to.include({ lang: 'javascript' });
      });

      // TODO: update when we add tester to use case
      it('should include the tester correctly', () => {
        expect(output).to.include({ tester: null });
      });

      it('should render the main file correctly', () => {
        expect(output).to.include({ mainFile: path.normalize('src/mainFile.js') });
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
        expect(output).to.include({ mainFile: path.normalize('src/mainFile.js') });
      });

      describe('when the compiler is changed in the consumer bit.json', () => {
        let bitJson;
        before(() => {
          bitJson = helper.readBitJson();
          const clonedBitJson = R.clone(bitJson);
          clonedBitJson.env.compiler = 'scope/namespace/name@0.0.1';
          helper.writeBitJson(clonedBitJson);
        });
        after(() => {
          helper.writeBitJson(bitJson);
        });
        it('should display the compiler of the component', () => {
          const outputCompiler = output.compiler;
          expect(outputCompiler.files).to.be.an('array').that.is.empty;
          expect(outputCompiler.config).to.be.an('object').that.is.empty;
          expect(outputCompiler.name).have.string(`${helper.envScope}/compilers/babel${VERSION_DELIMITER}0.0.1`);
        });
      });
    });

    it.skip('should throw an error if the -v flag provided', () => {});
  });

  describe('remote components', () => {
    let scopeBeforeShow;
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      scopeBeforeShow = helper.cloneLocalScope();
      output = helper.showComponent(`${helper.remoteScope}/bar/foo --remote`);
    });
    describe('single version as cli output (no -v or -j flags)', () => {
      it('should render the id correctly', () => {
        expect(output).to.have.string('bar/foo@0.0.1');
      });
      it('should render the language correctly', () => {
        expect(output).to.have.string('javascript');
      });
      it('should render the files correctly', () => {
        expect(output).to.have.string('Files');
        expect(output).to.have.string('bar/foo.js');
      });
      it('should render the main file correctly', () => {
        expect(output).to.have.string('Main File');
        expect(output).to.have.string('bar/foo.js');
      });
      describe('run bit show after bit show was running previously', () => {
        // we had a bug when the first 'bit show' save the component locally and the second one
        // triggered an error
        before(() => {
          helper.getClonedLocalScope(scopeBeforeShow);
          output = helper.showComponent(`${helper.remoteScope}/bar/foo --remote`);
          expect(output).to.have.string('Id');
          expect(output).to.have.string('bar/foo@0.0.1');
          output = helper.showComponent(`${helper.remoteScope}/bar/foo --remote`);
        });
        it('should still work and show the component with no errors', () => {
          expect(output).to.have.string('Id');
          expect(output).to.have.string('bar/foo@0.0.1');
        });
      });
    });
    describe.skip('all versions as cli output (without -j flag)', () => {
      it('should render the id correctly', () => {});

      it('should render the language correctly', () => {});

      it('should render the language correctly', () => {});

      it('should render the tester correctly', () => {});

      it('should render the dependencies correctly', () => {});

      it('should render the package dependencies correctly', () => {});
    });

    describe.skip('single version as json output', () => {
      // TODO: Make more test cases here
      it('should return correct json', () => {});
    });

    describe.skip('all versions as json output', () => {
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
      helper.tagComponentBarFoo();
      helper.exportAllComponents();
      helper.deprecateComponent(`${helper.remoteScope}/bar/foo`, '-r');
    });
    it('should show the component as deprecated when using "--remote" flag', () => {
      output = JSON.parse(helper.runCmd(`bit show ${helper.remoteScope}/bar/foo -j -r`));
      expect(output).to.include({ deprecated: true });
    });
    it('should not show the component as deprecated when not using "--remote" flag', () => {
      output = JSON.parse(helper.runCmd(`bit show ${helper.remoteScope}/bar/foo -j`));
      expect(output).to.include({ deprecated: false });
    });
  });
  describe('show non-deprecated remote component', () => {
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagComponentBarFoo();
      helper.exportAllComponents();
    });
    it('should indicate a component as non-deprecated when using "--remote" flag', () => {
      output = JSON.parse(helper.runCmd(`bit show ${helper.remoteScope}/bar/foo -j -r`));
      expect(output).to.include({ deprecated: false });
    });
    it('should indicate a component as non-deprecated when not using "--remote flag', () => {
      output = JSON.parse(helper.runCmd(`bit show ${helper.remoteScope}/bar/foo -j`));
      expect(output).to.include({ deprecated: false });
    });
  });
  describe('local component', () => {
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.importCompiler();

      helper.createFile('utils', 'is-string.js');
      helper.addComponentUtilsIsString();
      helper.tagComponent('utils/is-string');
    });

    it('Should not show component if bit.json is corrupted', () => {
      helper.corruptBitJson();
      try {
        helper.runCmd('bit show comp/comp -j');
      } catch (err) {
        output = err.toString();
      }
      expect(output).to.include('error: invalid bit.json: ');
      expect(output).to.include(`${path.join(helper.localScopePath, 'bit.json')}`);
    });
  });
  describe('local component without compiler', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
    });
    describe('when the consumer bit.json has a compiler', () => {
      let jsonOutput;
      before(() => {
        const bitJson = helper.readBitJson();
        bitJson.env.compiler = 'scope/namespace/name@0.0.1';
        helper.writeBitJson(bitJson);
        const output = helper.showComponent('bar/foo --json');
        jsonOutput = JSON.parse(output);
      });
      it('should not show the consumer compiler', () => {
        expect(jsonOutput.compiler).to.be.a('null');
      });
    });
  });
  describe('with removed file/files', () => {
    beforeEach(() => {
      helper.initNewLocalScope();
      helper.createComponentBarFoo();
      helper.createFile('bar', 'index.js');
      helper.addComponent('bar/', { i: 'bar/foo' });
    });
    it('Should show component only with the left files', () => {
      const beforeRemoveBitMap = helper.readBitMap();
      const beforeRemoveBitMapfiles = beforeRemoveBitMap['bar/foo'].files;
      expect(beforeRemoveBitMapfiles).to.be.ofSize(2);
      helper.deletePath('bar/foo.js');
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
      helper.deletePath('bar/index.js');
      helper.deletePath('bar/foo.js');

      const showCmd = () => helper.showComponent('bar/foo');
      const error = new MissingFilesFromComponent('bar/foo');
      helper.expectToThrow(showCmd, error);
    });
  });
  describe('with --compare flag', () => {
    before(() => {
      helper.initNewLocalScope();
      helper.createComponentBarFoo();
      helper.createFile('bar', 'index.js');
      helper.addComponent('bar/', { i: 'bar/foo' });
    });
    describe('when adding a component without tagging it', () => {
      it('Should throw error nothing to compare no previous versions found', () => {
        const showCmd = () => helper.showComponent('bar/foo --compare');
        expect(showCmd).to.throw('Command failed: bit show bar/foo --compare\nno previous versions to compare\n');
      });
    });
    describe('when the component is AUTHORED', () => {
      before(() => {
        helper.tagAllComponents();
      });
      it('should not throw an error "nothing to compare no previous versions found"', () => {
        const showCmd = () => helper.showComponent('bar/foo --compare');
        expect(showCmd).not.to.throw();
      });
      it('model and file-system should have the same main file and files, regardless the originallySharedDir (bar)', () => {
        const result = helper.showComponent('bar/foo --compare --json');
        const { componentFromFileSystem, componentFromModel } = JSON.parse(result);
        expect(componentFromFileSystem.mainFile).to.equal(componentFromModel.mainFile);
        expect(componentFromFileSystem.files).to.deep.equal(componentFromModel.files);

        // files should contain the originallySharedDir
        expect(componentFromModel.mainFile).to.have.string('bar');
      });
    });
    describe('when importing a component', () => {
      before(() => {
        helper.tagAllComponents(undefined, undefined, false);
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

        // files should not contain the originallySharedDir
        expect(componentFromFileSystem.mainFile).to.not.have.string('bar');
      });
    });
  });
  describe('with --outdated flag', () => {
    describe('with a consumer component', () => {
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
        helper.createFile('utils', 'is-type.js', isTypeFixture);
        helper.addComponentUtilsIsType();
        helper.tagComponent('utils/is-type');
        helper.tagComponent('utils/is-type', 'msg', '-f');
        helper.exportAllComponents();

        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('utils/is-type@0.0.1');

        const isStringFixture = `const isType = require('${helper.getRequireBitPath(
          'utils',
          'is-type'
        )}'); module.exports = function isString() { return isType() +  ' and got is-string'; };`;
        helper.createFile('utils', 'is-string.js', isStringFixture);
        helper.addComponentUtilsIsString();
        helper.tagAllComponents();
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
          helper.tagComponent('utils/is-type', 'msg', '-f --ignore-newest-version');
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
        helper.createFile('utils', 'is-type.js', isTypeFixture);
        helper.addComponentUtilsIsType();
        helper.tagComponent('utils/is-type');
        helper.tagComponent('utils/is-type', 'msg', '-f');
        helper.exportAllComponents();

        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('utils/is-type@0.0.1');

        const isStringFixture = `const isType = require('${helper.getRequireBitPath(
          'utils',
          'is-type'
        )}'); module.exports = function isString() { return isType() +  ' and got is-string'; };`;
        helper.createFile('utils', 'is-string.js', isStringFixture);
        helper.addComponentUtilsIsString();
        helper.tagAllComponents();
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
  describe('show versions of exported component with the -v flag', () => {
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagComponentBarFoo();
      helper.exportAllComponents();
    });
    it('should show versions of authored component when not specifying scope name', () => {
      output = helper.runCmd('bit show bar/foo -v');
      const parsedOutput = JSON.parse(output);
      expect(parsedOutput).to.be.ofSize(1);
      expect(parsedOutput[0]).to.to.include({
        name: 'bar/foo',
        version: '0.0.1'
      });
    });
    // TODO: complete tests after feature is finished
    it.skip('Should show versions of a remote component using scope name when you are not the author', () => {
      output = helper.runCmd('bit show bit.envs/compilers/babel -v');
      console.log(output);
    });
  });
  describe('component with overrides data', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      const overrides = {
        'bar/foo': {
          dependencies: {
            chai: '4.3.2'
          }
        }
      };
      helper.addOverridesToBitJson(overrides);
    });
    it('should not show the overrides data when --detailed was not used', () => {
      const barFoo = helper.showComponent('bar/foo');
      expect(barFoo).to.not.have.string('overrides');
    });
    it('should show the overrides data when --detailed was used', () => {
      const barFoo = helper.showComponent('bar/foo --detailed');
      expect(barFoo).to.have.string('Overrides Dependencies');
    });
  });
  describe('class with properties', () => {
    let barFoo;
    before(() => {
      helper.reInitLocalScope();
      const classReactFixture = `import React, { Component } from 'react';
import PropTypes from 'prop-types';

export default class Circle extends Component {
    render() {
        return <div className="lds-circle" style={{ background: this.props.color }}></div>
    }
}

Circle.propTypes = {
    color: PropTypes.string
}

Circle.defaultProps = {
    color: '#fff'
}`;
      helper.createComponentBarFoo(classReactFixture);
      helper.addComponentBarFoo();
      barFoo = helper.showComponent();
    });
    it('should show the properties data', () => {
      expect(barFoo).to.have.string('Properties');
      expect(barFoo).to.have.string('(color: string)');
    });
    it('should not show Args and Returns as they are empty and not relevant for classes', () => {
      expect(barFoo).to.not.have.string('Args');
      expect(barFoo).to.not.have.string('Returns');
    });
  });
});
