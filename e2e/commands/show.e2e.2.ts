import chai, { expect } from 'chai';
import * as path from 'path';
import R from 'ramda';

import NothingToCompareTo from '../../src/api/consumer/lib/exceptions/nothing-to-compare-to';
import MissingFilesFromComponent from '../../src/consumer/component/exceptions/missing-files-from-component';
import Helper, { VERSION_DELIMITER } from '../../src/e2e-helper/e2e-helper';

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('bit show command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });

  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('run before running "bit init" with .bit.map.json', () => {
    it('Should init consumer add then show component', () => {
      helper.bitMap.create();
      helper.fs.createFile('bar', 'foo.js');
      const output = helper.command.showComponent('bar/foo');
      expect(output).to.include('bar/foo');
    });
  });
  describe('local component', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.env.importCompiler();

      helper.fs.createFile('utils', 'is-string.js');
      helper.fixtures.addComponentUtilsIsString();
      helper.command.tagComponent('utils/is-string');

      helper.npm.addNpmPackage();

      const fooBarFixture =
        "const isString = require('../utils/is-string.js'); const get = require('lodash.get'); module.exports = function foo() { return isString() + ' and got foo'; };";
      helper.fs.createFile('src', 'mainFile.js', fooBarFixture);
      helper.fs.createFile('src/utils', 'utilFile.js');
      helper.command.addComponent('src/mainFile.js src/utils/utilFile.js', {
        m: 'src/mainFile.js',
        i: 'comp/comp',
      });
      helper.command.tagComponent('comp/comp');
    });

    describe('show deprecated local component', () => {
      let output;
      it('should not show deprecated component if not deprecated ', () => {
        output = helper.command.runCmd('bit show comp/comp');
        expect(output).to.not.include('Deprecated');
      });

      it('should show deprecated component', () => {
        output = JSON.parse(helper.command.runCmd('bit show comp/comp -j'));
        expect(output).to.include({ deprecated: false });
      });
      it('should show deprecated component', () => {
        helper.command.deprecateComponent('comp/comp');
        output = JSON.parse(helper.command.runCmd('bit show comp/comp -j'));
        expect(output).to.include({ deprecated: true });
      });
      it('should show local deprecated component without -j', () => {
        helper.command.deprecateComponent('comp/comp');
        output = helper.command.runCmd('bit show comp/comp');
        expect(output).to.include('Deprecated');
      });
    });

    describe('single version as cli output (no -v or -j flags)', () => {
      let output;

      before(() => {
        output = helper.command.runCmd('bit show comp/comp');
      });

      it('should render the id correctly', () => {
        expect(output).to.have.string('Id', 'Id row is missing');
        expect(output).to.have.string('comp/comp', 'component id is wrong');
      });

      it('should render the compiler correctly', () => {
        expect(output).to.have.string('Compiler', 'Compiler row is missing');
        expect(output).to.have.string(`${helper.scopes.env}/compilers/babel@0.0.1`, 'compiler is wrong');
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
        output = JSON.parse(helper.command.runCmd('bit show comp/comp -j'));
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
        expect(outputCompiler.config).to.be.an('object').that.is.empty;
        expect(outputCompiler.name).have.string(`${helper.scopes.env}/compilers/babel${VERSION_DELIMITER}0.0.1`);
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
          bitJson = helper.bitJson.read();
          const clonedBitJson = R.clone(bitJson);
          clonedBitJson.env.compiler = 'scope/namespace/name@0.0.1';
          helper.bitJson.write(clonedBitJson);
        });
        after(() => {
          helper.bitJson.write(bitJson);
        });
        it('should display the compiler of the component', () => {
          const outputCompiler = output.compiler;
          expect(outputCompiler.config).to.be.an('object').that.is.empty;
          expect(outputCompiler.name).have.string(`${helper.scopes.env}/compilers/babel${VERSION_DELIMITER}0.0.1`);
        });
      });
    });

    it.skip('should throw an error if the -v flag provided', () => {});
  });

  describe('remote components', () => {
    let scopeBeforeShow;
    let output;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      scopeBeforeShow = helper.scopeHelper.cloneLocalScope();
      output = helper.command.showComponent(`${helper.scopes.remote}/bar/foo --remote`);
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
          helper.scopeHelper.getClonedLocalScope(scopeBeforeShow);
          output = helper.command.showComponent(`${helper.scopes.remote}/bar/foo --remote`);
          expect(output).to.have.string('Id');
          expect(output).to.have.string('bar/foo@0.0.1');
          output = helper.command.showComponent(`${helper.scopes.remote}/bar/foo --remote`);
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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.command.exportAllComponents();
      helper.command.deprecateComponent(`${helper.scopes.remote}/bar/foo`, '-r');
    });
    it('should show the component as deprecated when using "--remote" flag', () => {
      output = JSON.parse(helper.command.runCmd(`bit show ${helper.scopes.remote}/bar/foo -j -r`));
      expect(output).to.include({ deprecated: true });
    });
    it('should not show the component as deprecated when not using "--remote" flag', () => {
      output = JSON.parse(helper.command.runCmd(`bit show ${helper.scopes.remote}/bar/foo -j`));
      expect(output).to.include({ deprecated: false });
    });
  });
  describe('show non-deprecated remote component', () => {
    let output;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.command.exportAllComponents();
    });
    it('should indicate a component as non-deprecated when using "--remote" flag', () => {
      output = JSON.parse(helper.command.runCmd(`bit show ${helper.scopes.remote}/bar/foo -j -r`));
      expect(output).to.include({ deprecated: false });
    });
    it('should indicate a component as non-deprecated when not using "--remote flag', () => {
      output = JSON.parse(helper.command.runCmd(`bit show ${helper.scopes.remote}/bar/foo -j`));
      expect(output).to.include({ deprecated: false });
    });
  });
  describe('local component', () => {
    let output;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.env.importCompiler();

      helper.fs.createFile('utils', 'is-string.js');
      helper.fixtures.addComponentUtilsIsString();
      helper.command.tagComponent('utils/is-string');
    });

    it('Should not show component if bit.json is corrupted', () => {
      helper.bitJson.corrupt();
      try {
        helper.command.runCmd('bit show comp/comp -j');
      } catch (err) {
        output = err.toString();
      }
      expect(output).to.include('error: invalid bit.json: ');
      expect(output).to.include(`${path.join(helper.scopes.localPath, 'bit.json')}`);
    });
  });
  describe('local component without compiler', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');
    });
    describe('when the consumer bit.json has a compiler', () => {
      let jsonOutput;
      before(() => {
        const bitJson = helper.bitJson.read();
        bitJson.env.compiler = 'scope/namespace/name@0.0.1';
        helper.bitJson.write(bitJson);
        const output = helper.command.showComponent('bar/foo --json');
        jsonOutput = JSON.parse(output);
      });
      it('should not show the consumer compiler', () => {
        expect(jsonOutput.compiler).to.be.a('null');
      });
    });
  });
  describe('with removed file/files', () => {
    beforeEach(() => {
      helper.scopeHelper.initNewLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fs.createFile('bar', 'index.js');
      helper.command.addComponent('bar/', { i: 'bar/foo' });
    });
    it('Should show component only with the left files', () => {
      const beforeRemoveBitMap = helper.bitMap.read();
      const beforeRemoveBitMapfiles = beforeRemoveBitMap['bar/foo'].files;
      expect(beforeRemoveBitMapfiles).to.be.ofSize(2);
      helper.fs.deletePath('bar/foo.js');
      const output = helper.command.showComponent('bar/foo -j');
      const bitMap = helper.bitMap.read();
      const files = bitMap['bar/foo'].files;
      expect(files).to.be.ofSize(1);
      expect(files[0].name).to.equal('index.js');
      expect(JSON.parse(output).files).to.be.ofSize(1);
    });
    it('Should throw error that all files were removed', () => {
      const beforeRemoveBitMap = helper.bitMap.read();
      const beforeRemoveBitMapfiles = beforeRemoveBitMap['bar/foo'].files;
      expect(beforeRemoveBitMapfiles).to.be.ofSize(2);
      helper.fs.deletePath('bar/index.js');
      helper.fs.deletePath('bar/foo.js');

      const showCmd = () => helper.command.showComponent('bar/foo');
      const error = new MissingFilesFromComponent('bar/foo');
      helper.general.expectToThrow(showCmd, error);
    });
  });
  describe('with --compare flag', () => {
    before(() => {
      helper.scopeHelper.initNewLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fs.createFile('bar', 'index.js');
      helper.command.addComponent('bar/', { i: 'bar/foo' });
    });
    describe('when adding a component without tagging it', () => {
      it('Should throw error nothing to compare no previous versions found', () => {
        const showCmd = () => helper.command.showComponent('bar/foo --compare');
        const error = new NothingToCompareTo('bar/foo');
        helper.general.expectToThrow(showCmd, error);
      });
    });
    describe('when the component is AUTHORED', () => {
      before(() => {
        helper.command.tagAllComponents();
      });
      it('should not throw an error "nothing to compare no previous versions found"', () => {
        const showCmd = () => helper.command.showComponent('bar/foo --compare');
        expect(showCmd).not.to.throw();
      });
      it('model and file-system should have the same main file and files, regardless the originallySharedDir (bar)', () => {
        const result = helper.command.showComponent('bar/foo --compare --json');
        const { componentFromFileSystem, componentFromModel } = JSON.parse(result);
        expect(componentFromFileSystem.mainFile).to.equal(componentFromModel.mainFile);
        expect(componentFromFileSystem.files).to.deep.equal(componentFromModel.files);

        // files should contain the originallySharedDir
        expect(componentFromModel.mainFile).to.have.string('bar');
      });
    });
    describe('when importing a component', () => {
      before(() => {
        helper.command.tagAllComponents(undefined, undefined, false);
        helper.scopeHelper.reInitRemoteScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.exportAllComponents();
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo@0.0.1');
      });
      it('Should not throw an error "nothing to compare no previous versions found"', () => {
        const showCmd = () => helper.command.showComponent('bar/foo --compare');
        expect(showCmd).not.to.throw();
      });
      it('model and file-system should have the same main file and files, regardless the originallySharedDir (bar)', () => {
        const result = helper.command.showComponent('bar/foo --compare --json');
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
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fixtures.populateWorkspaceWithUtilsIsType();
        helper.command.tagComponent('utils/is-type');
        helper.command.tagComponent('utils/is-type', 'msg', '-f');
        helper.command.exportAllComponents();

        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('utils/is-type@0.0.1');

        const isStringFixture = `const isType = require('${helper.general.getRequireBitPath(
          'utils',
          'is-type'
        )}'); module.exports = function isString() { return isType() +  ' and got is-string'; };`;
        helper.fs.createFile('utils', 'is-string.js', isStringFixture);
        helper.fixtures.addComponentUtilsIsString();
        helper.command.tagAllComponents();
      });
      describe('when a component uses an old version of a dependency', () => {
        it('should indicate that the remote version is larger than the current version', () => {
          const output = helper.command.showComponent('utils/is-string --outdated --json');
          const outputParsed = JSON.parse(output);
          expect(outputParsed.dependencies[0].currentVersion).to.equal('0.0.1');
          expect(outputParsed.dependencies[0].localVersion).to.equal('0.0.2');
          expect(outputParsed.dependencies[0].remoteVersion).to.equal('0.0.2');
        });
      });
      describe('when the dependency was updated locally but not exported yet', () => {
        before(() => {
          helper.command.tagComponent('utils/is-type', 'msg', '-f --ignore-newest-version');
        });
        it('should indicate that the current version is larger than the remote version', () => {
          const output = helper.command.showComponent('utils/is-string --outdated --json');
          const outputParsed = JSON.parse(output);
          expect(outputParsed.dependencies[0].currentVersion).to.equal('0.0.3');
          expect(outputParsed.dependencies[0].localVersion).to.equal('0.0.3');
          expect(outputParsed.dependencies[0].remoteVersion).to.equal('0.0.2');
        });
      });
      describe('when the dependency is up to date', () => {
        before(() => {
          helper.command.exportAllComponents();
        });
        it('should indicate that all versions are the same', () => {
          const output = helper.command.showComponent('utils/is-string --outdated --json');
          const outputParsed = JSON.parse(output);
          expect(outputParsed.dependencies[0].currentVersion).to.equal('0.0.3');
          expect(outputParsed.dependencies[0].localVersion).to.equal('0.0.3');
          expect(outputParsed.dependencies[0].remoteVersion).to.equal('0.0.3');
        });
      });
    });
    describe('with a scope component', () => {
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fixtures.populateWorkspaceWithUtilsIsType();
        helper.command.tagComponent('utils/is-type');
        helper.command.tagComponent('utils/is-type', 'msg', '-f');
        helper.command.exportAllComponents();

        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('utils/is-type@0.0.1');

        const isStringFixture = `const isType = require('${helper.general.getRequireBitPath(
          'utils',
          'is-type'
        )}'); module.exports = function isString() { return isType() +  ' and got is-string'; };`;
        helper.fs.createFile('utils', 'is-string.js', isStringFixture);
        helper.fixtures.addComponentUtilsIsString();
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();

        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        // @todo: add a test case before importing the component. Currently there is a bug that it downloads the
        // component into the model in such a case
        helper.command.importComponent('utils/is-string@0.0.1');
      });
      it('should show the remote and local versions', () => {
        const output = helper.command.showComponent(`${helper.scopes.remote}/utils/is-string --outdated --json`);
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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.command.exportAllComponents();
    });
    it('should show versions of authored component when not specifying scope name', () => {
      output = helper.command.runCmd('bit show bar/foo -v --json');
      const parsedOutput = JSON.parse(output);
      expect(parsedOutput).to.be.ofSize(1);
      expect(parsedOutput[0]).to.to.include({
        name: 'bar/foo',
        version: '0.0.1',
      });
    });
  });
  describe('component with overrides data', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      const overrides = {
        'bar/foo': {
          dependencies: {
            chai: '4.3.2',
            react: '+',
          },
        },
      };
      helper.bitJson.addOverrides(overrides);
    });
    it('should not show the overrides data when --detailed was not used', () => {
      const barFoo = helper.command.showComponent('bar/foo');
      expect(barFoo).to.not.have.string('overrides');
    });
    it('should not show missing packages from overrides', () => {
      const barFoo = helper.command.showComponent('bar/foo');
      expect(barFoo).to.not.have.string('react');
    });
    it('should show the overrides data when --detailed was used', () => {
      const barFoo = helper.command.showComponent('bar/foo --detailed');
      expect(barFoo).to.have.string('Overrides Dependencies');
    });
  });
  describe('class with properties', () => {
    let barFoo;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
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
      helper.fixtures.createComponentBarFoo(classReactFixture);
      helper.fixtures.addComponentBarFoo();
      barFoo = helper.command.showComponent();
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
  describe('show with --dependents and --dependencies flag', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithThreeComponents();
      helper.fs.createFile('bar-dep', 'bar.js');
      helper.fs.createFile('bar-dep', 'bar.spec.js', 'require("../bar/foo.js");'); // a dev dependency requires bar/foo
      helper.command.addComponent('bar-dep', { m: 'bar-dep/bar.js', t: 'bar-dep/bar.spec.js' });
      helper.fs.createFile('baz', 'baz.js'); // a component that not related to other dependencies/dependents
      helper.command.addComponent('baz/baz.js');
      helper.command.linkAndRewire();
      helper.command.tagAllComponents();
      helper.command.exportAllComponentsAndRewire();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
    });
    describe('with local scope', () => {
      before(() => {
        helper.command.importComponent('*');
      });
      describe('when using --dependents', () => {
        let show;
        before(() => {
          show = helper.command.showComponentParsed('utils/is-string --dependents');
        });
        it('should show the dependents only', () => {
          expect(show).to.have.property('dependentsInfo').that.is.an('array').with.lengthOf(2);
          expect(show).to.have.property('dependenciesInfo').to.deep.equal([]);
        });
        it('should show all dependents sorted by depth', () => {
          expect(show.dependentsInfo[0]).to.have.property('depth').that.equals(1);
          expect(show.dependentsInfo[0].id.name).to.equal('bar/foo');
          expect(show.dependentsInfo[1]).to.have.property('depth').that.equals(2);
          expect(show.dependentsInfo[1].id.name).to.equal('bar-dep');
        });
      });
      describe('when using --dependencies', () => {
        let show;
        before(() => {
          show = helper.command.showComponentParsed('utils/is-string --dependencies');
        });
        it('should show the dependencies only', () => {
          expect(show).to.have.property('dependenciesInfo').that.is.an('array').with.lengthOf(1);
          expect(show).to.have.property('dependentsInfo').to.deep.equal([]);
        });
        it('should show all dependencies', () => {
          expect(show.dependenciesInfo[0]).to.have.property('depth').that.equals(1);
          expect(show.dependenciesInfo[0].id.name).to.equal('utils/is-type');
        });
      });
    });
    describe('with remote scope (using --remote flag)', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
      });
      describe('when using --dependents', () => {
        let show;
        before(() => {
          show = helper.command.showComponentParsed(`${helper.scopes.remote}/utils/is-string --remote --dependents`);
        });
        it('should show the dependents only', () => {
          expect(show).to.have.property('dependentsInfo').that.is.an('array').with.lengthOf(2);
          expect(show).to.have.property('dependenciesInfo').to.deep.equal([]);
        });
        it('should show all dependents sorted by depth', () => {
          expect(show.dependentsInfo[0]).to.have.property('depth').that.equals(1);
          expect(show.dependentsInfo[0].id.name).to.equal('bar/foo');
          expect(show.dependentsInfo[1]).to.have.property('depth').that.equals(2);
          expect(show.dependentsInfo[1].id.name).to.equal('bar-dep');
        });
      });
      describe('when using --dependencies', () => {
        let show;
        before(() => {
          show = helper.command.showComponentParsed(`${helper.scopes.remote}/utils/is-string --remote --dependencies`);
        });
        it('should show the dependencies only', () => {
          expect(show).to.have.property('dependenciesInfo').that.is.an('array').with.lengthOf(1);
          expect(show).to.have.property('dependentsInfo').to.deep.equal([]);
        });
        it('should show all dependencies', () => {
          expect(show.dependenciesInfo[0]).to.have.property('depth').that.equals(1);
          expect(show.dependenciesInfo[0].id.name).to.equal('utils/is-type');
        });
      });
    });
  });
  describe('show with --dependents flag on a new component', () => {
    let show;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithThreeComponents();
      show = helper.command.showComponentParsed('utils/is-string --dependents --dependencies');
    });
    it('should show all dependents and dependencies', () => {
      expect(show).to.have.property('dependentsInfo').that.is.an('array').with.lengthOf(1);
      expect(show).to.have.property('dependenciesInfo').that.is.an('array').with.lengthOf(1);
      expect(show.dependenciesInfo[0].id.name).to.equal('utils/is-type');
      expect(show.dependentsInfo[0].id.name).to.equal('bar/foo');
    });
  });
});
