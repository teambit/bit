// covers also init, create, commit, modify commands
import chai, { expect } from 'chai';
import path from 'path';
import fs from 'fs-extra';
import glob from 'glob';
import normalize from 'normalize-path';
import Helper, { VERSION_DELIMITER } from '../e2e-helper';
import * as fixtures from '../fixtures/fixtures';

chai.use(require('chai-fs'));

const assertArrays = require('chai-arrays');

chai.use(assertArrays);
chai.use(require('chai-string'));

describe('bit import', function () {
  this.timeout(0);
  const helper = new Helper();

  after(() => {
    helper.destroyEnv();
  });

  describe('stand alone component (without dependencies)', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      // export a new simple component
      helper.createFile('global', 'simple.js');
      helper.addComponent(path.normalize('global/simple.js'));
      helper.commitComponent('simple');
      helper.exportComponent('simple');

      helper.reInitLocalScope();
      helper.addRemoteScope();
      const output = helper.importComponent('global/simple');
      expect(output.includes('successfully imported one component')).to.be.true;
      expect(output.includes('global/simple')).to.be.true;
    });
    it.skip('should throw an error if there is already component with the same name and namespace and different scope', () => {});
    it('should add the component to bit.json file', () => {
      const bitJson = helper.readBitJson();
      const depName = [helper.remoteScope, 'global', 'simple'].join('/');
      expect(bitJson.dependencies).to.include({ [depName]: '0.0.1' });
    });
    it('should add the component into bit.map file with the full id', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property(`${helper.remoteScope}/global/simple${VERSION_DELIMITER}0.0.1`);
    });
    // TODO: Validate all files exists in a folder with the component name
    it('should write the component to default path from bit.json', () => {
      // TODO: check few cases with different structure props - namespace, name, version, scope
      const expectedLocation = path.join(helper.localScopePath, 'components', 'global', 'simple', 'simple.js');
      expect(fs.existsSync(expectedLocation)).to.be.true;
    });
    it('should not write the component bit.json file (only when --conf flag is set)', () => {
      const bitJsonLocation = path.join(helper.localScopePath, 'components', 'global', 'simple', 'bit.json');
      expect(fs.existsSync(bitJsonLocation)).to.be.false;
    });

    describe('with multiple files located in different directories', () => {
      before(() => {
        helper.createFile('src', 'imprel.js');
        helper.createFile('src', 'imprel.spec.js');
        helper.createFile('src/utils', 'myUtil.js');
        helper.runCmd(
          'bit add src/imprel.js src/utils/myUtil.js -t src/imprel.spec.js -m src/imprel.js -i imprel/imprel'
        );
        helper.commitComponent('imprel/imprel');
        helper.exportComponent('imprel/imprel');
        helper.reInitLocalScope();
        helper.addRemoteScope();
        const output = helper.importComponent('imprel/imprel');
        expect(output.includes('successfully imported one component')).to.be.true;
        expect(output.includes('imprel/imprel')).to.be.true;
      });
      it('should write the internal files according to their relative paths', () => {
        const imprelRoot = path.join(helper.localScopePath, 'components', 'imprel', 'imprel');
        const expectedLocationImprel = path.join(imprelRoot, 'imprel.js');
        const expectedLocationImprelSpec = path.join(imprelRoot, 'imprel.spec.js');
        const expectedLocationMyUtil = path.join(imprelRoot, 'utils', 'myUtil.js');
        expect(fs.existsSync(expectedLocationImprel)).to.be.true;
        expect(fs.existsSync(expectedLocationImprelSpec)).to.be.true;
        expect(fs.existsSync(expectedLocationMyUtil)).to.be.true;
      });
    });

    describe('with --conf flag', () => {
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('global/simple --conf');
      });
      it('should write the bit.json file of the component', () => {
        const expectedLocation = path.join(helper.localScopePath, 'components', 'global', 'simple', 'bit.json');
        expect(fs.existsSync(expectedLocation)).to.be.true;
      });
    });

    describe('with a specific path, using -p flag', () => {
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.runCmd(`bit import ${helper.remoteScope}/global/simple -p my-custom-location`);
      });
      it('should write the component to the specified path', () => {
        const expectedLocation = path.join(helper.localScopePath, 'my-custom-location', 'simple.js');
        expect(fs.existsSync(expectedLocation)).to.be.true;
      });

      it('should write the internal files according to their relative paths', () => {});
    });

    describe('re-import after deleting the component physically', () => {
      let output;
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('global/simple');
        fs.removeSync(path.join(helper.localScopePath, 'components'));
        output = helper.importComponent('global/simple');
      });
      it('should import the component successfully', () => {
        expect(output).to.have.string('successfully imported one component');
      });
    });

    describe('re-import after deleting the bit.map file', () => {
      let output;
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('global/simple');
        fs.removeSync(path.join(helper.localScopePath, '.bitmap'));
        output = helper.importComponent('global/simple');
      });
      it('should import the component successfully', () => {
        expect(output).to.have.string('successfully imported one component');
      });
    });
    describe('import component with custom dsl as destination dir for import', () => {
      let output;
      before(() => {
        helper.reInitLocalScope();
        helper.setComponentsDirInBitJson('{scope}/{namespace}-{name}');
        helper.addRemoteScope();
        helper.importComponent('global/simple');
        output = helper.importComponent('global/simple');
      });
      it('should import the component successfully', () => {
        expect(output).to.have.string('successfully imported one component');
      });
      it('should import the component into new dir structure according to dsl', () => {
        expect(path.join(helper.localScopePath, helper.remoteScope, 'global-simple')).to.be.a.directory(
          'should not be empty'
        ).and.not.empty;
      });
      it('bitmap should contain component with correct rootDir according to dsl', () => {
        const bitMap = helper.readBitMap();
        const cmponentId = `${helper.remoteScope}/global/simple@0.0.1`;
        expect(bitMap).to.have.property(cmponentId);
        expect(bitMap[cmponentId].rootDir).to.equal(`${helper.remoteScope}/global-simple`);
      });
    });
  });

  describe('with compiler and tests', () => {
    describe('with multiple files located in different directories', () => {
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.importCompiler();
        helper.createFile('src', 'imprel.js');
        helper.createFile('src', 'imprel.spec.js');
        helper.createFile('src/utils', 'myUtil.js');
        helper.runCmd(
          'bit add src/imprel.js src/utils/myUtil.js -t src/imprel.spec.js -m src/imprel.js -i imprel/impreldist'
        );
        helper.commitComponent('imprel/impreldist');
        helper.exportComponent('imprel/impreldist');
      });
      describe('when a project is cloned somewhere else as AUTHORED', () => {
        let localConsumerFiles;
        before(() => {
          helper.mimicGitCloneLocalProject(false);
          helper.addRemoteScope();
          helper.runCmd('bit import --write --force');
          localConsumerFiles = helper.getConsumerFiles();
        });
        it('should write the internal files according to their original paths', () => {
          expect(localConsumerFiles).to.include(path.join('src', 'imprel.js'));
          expect(localConsumerFiles).to.include(path.join('src', 'imprel.spec.js'));
          expect(localConsumerFiles).to.include(path.join('src', 'utils', 'myUtil.js'));
        });
        it('should not write the dist files', () => {
          localConsumerFiles.forEach((file) => {
            expect(file.startsWith('components')).to.be.false;
            expect(file.endsWith('.map.js')).to.be.false;
          });
        });
      });
      describe('when imported', () => {
        let localConsumerFiles;
        const imprelDir = path.join('components', 'imprel', 'impreldist');
        const expectedLocationImprel = path.join(imprelDir, 'imprel.js');
        const expectedLocationImprelSpec = path.join(imprelDir, 'imprel.spec.js');
        const expectedLocationMyUtil = path.join(imprelDir, 'utils', 'myUtil.js');
        const expectedLocationImprelDist = path.join(imprelDir, 'dist', 'imprel.js');
        const expectedLocationImprelSpecDist = path.join(imprelDir, 'dist', 'imprel.spec.js');
        const expectedLocationMyUtilDist = path.join(imprelDir, 'dist', 'utils', 'myUtil.js');
        describe('without --ignore-dist flag', () => {
          before(() => {
            helper.reInitLocalScope();
            helper.addRemoteScope();
            helper.importComponent('imprel/impreldist');
            localConsumerFiles = helper.getConsumerFiles();
          });
          it('should write the internal files according to their relative paths', () => {
            expect(localConsumerFiles).to.include(expectedLocationImprel);
            expect(localConsumerFiles).to.include(expectedLocationImprelSpec);
            expect(localConsumerFiles).to.include(expectedLocationMyUtil);
          });
          it('should write the dist files in the component root dir', () => {
            expect(localConsumerFiles).to.include(expectedLocationImprelDist);
            expect(localConsumerFiles).to.include(expectedLocationImprelSpecDist);
            expect(localConsumerFiles).to.include(expectedLocationMyUtilDist);
          });
          describe('when a project is cloned somewhere else as IMPORTED', () => {
            before(() => {
              helper.mimicGitCloneLocalProject(false);
              helper.addRemoteScope();
              helper.runCmd('bit import --force --write');
              localConsumerFiles = helper.getConsumerFiles();
            });
            it('should write the internal files according to their relative paths', () => {
              expect(localConsumerFiles).to.include(expectedLocationImprel);
              expect(localConsumerFiles).to.include(expectedLocationImprelSpec);
              expect(localConsumerFiles).to.include(expectedLocationMyUtil);
            });
            it('should write the dist files in the component root dir', () => {
              expect(localConsumerFiles).to.include(expectedLocationImprelDist);
              expect(localConsumerFiles).to.include(expectedLocationImprelSpecDist);
              expect(localConsumerFiles).to.include(expectedLocationMyUtilDist);
            });
          });
        });
        describe('when dist is set to a non-default directory', () => {
          before(() => {
            helper.reInitLocalScope();
            helper.addRemoteScope();
            helper.modifyFieldInBitJson('dist', { target: 'another-dist' });
            helper.importComponent('imprel/impreldist');
            localConsumerFiles = helper.getConsumerFiles();
          });
          it('should write the dist files according to the new dist-target set in bit.json', () => {
            const newDistDir = path.join('another-dist', 'components', 'imprel', 'impreldist');
            const newLocationImprelDist = path.join(newDistDir, 'imprel.js');
            const newLocationImprelSpecDist = path.join(newDistDir, 'imprel.spec.js');
            const newLocationMyUtilDist = path.join(newDistDir, 'utils', 'myUtil.js');
            expect(localConsumerFiles).to.include(newLocationImprelDist);
            expect(localConsumerFiles).to.include(newLocationImprelSpecDist);
            expect(localConsumerFiles).to.include(newLocationMyUtilDist);
          });
        });
        describe('with --ignore-dist flag', () => {
          before(() => {
            helper.reInitLocalScope();
            helper.addRemoteScope();
            helper.importComponent('imprel/impreldist --ignore-dist');
            localConsumerFiles = helper.getConsumerFiles();
          });
          it('should write the internal files according to their relative paths', () => {
            expect(localConsumerFiles).to.include(expectedLocationImprel);
            expect(localConsumerFiles).to.include(expectedLocationImprelSpec);
            expect(localConsumerFiles).to.include(expectedLocationMyUtil);
          });
          it('should not write the dist files in the component root dir', () => {
            expect(localConsumerFiles).to.not.include(expectedLocationImprelDist);
            expect(localConsumerFiles).to.not.include(expectedLocationImprelSpecDist);
            expect(localConsumerFiles).to.not.include(expectedLocationMyUtilDist);
          });
          describe('when a project is cloned somewhere else as IMPORTED', () => {
            before(() => {
              helper.mimicGitCloneLocalProject(false);
              helper.addRemoteScope();
              helper.runCmd('bit import --write --ignore-dist --force');
              localConsumerFiles = helper.getConsumerFiles();
            });
            it('should write the internal files according to their relative paths', () => {
              expect(localConsumerFiles).to.include(expectedLocationImprel);
              expect(localConsumerFiles).to.include(expectedLocationImprelSpec);
              expect(localConsumerFiles).to.include(expectedLocationMyUtil);
            });
            it('should not write the dist files in the component root dir', () => {
              expect(localConsumerFiles).to.not.include(expectedLocationImprelDist);
              expect(localConsumerFiles).to.not.include(expectedLocationImprelSpecDist);
              expect(localConsumerFiles).to.not.include(expectedLocationMyUtilDist);
            });
          });
        });
      });
    });
    it.skip('should not install envs when not requested', () => {});
    it.skip('should install envs when requested (-e)', () => {});
    it.skip('should create bit.json file with envs in the folder', () => {});
  });

  describe('import deprecated component', () => {
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('src', 'imprel.js');
      helper.createFile('src', 'imprel.spec.js');
      helper.createFile('src/utils', 'myUtil.js');
      helper.runCmd(
        'bit add src/imprel.js src/utils/myUtil.js -t src/imprel.spec.js -m src/imprel.js -i imprel/imprel'
      );
      helper.commitComponent('imprel/imprel');
      helper.deprecateComponent('imprel/imprel');
      helper.exportComponent('imprel/imprel');
      helper.reInitLocalScope();
      helper.addRemoteScope();
      output = helper.importComponent('imprel/imprel');
    });
    it('should import component with deprecated msg', () => {
      expect(output.includes('successfully imported one component')).to.be.true;
      expect(output.includes('imprel/imprel@0.0.1  [Deprecated]')).to.be.true;
    });
  });

  describe('with an existing component in bit.map (as author)', () => {
    let localConsumerFiles;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.exportComponent('bar/foo');
      const bitMap = helper.readBitMap();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.writeBitMap(bitMap);
      helper.importComponent('bar/foo');
      localConsumerFiles = helper.getConsumerFiles();
    });
    // Prevent cases when I export a component with few files from different directories
    // and get it in another structure during imports (for example under components folder instead of original folder)
    it('should write the component to the paths specified in bit.map', () => {
      const expectedLocation = path.join('bar', 'foo.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should not remove the originallySharedDir (because it is an AUTHORED component)', () => {
      expect(localConsumerFiles).not.to.include('foo.js'); // it shouldn't remove 'bar'.
    });
    it('should not write any file into components directory', () => {
      localConsumerFiles.forEach((fileName) => {
        expect(fileName.startsWith('components')).to.be.false;
      });
    });
  });

  describe('import from bit json', () => {
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
    });
    describe('components with shared nested deps', () => {
      let myBitJsonPath;
      let localConsumerFiles;
      before(() => {
        helper.createFile('', 'level1.js');
        const level0Fixture = "import a from './level1'";
        helper.createFile('', 'level0.js', level0Fixture);
        helper.addComponentWithOptions('level0.js', { i: 'dep/level0' });
        helper.addComponentWithOptions('level1.js', { i: 'dep/level1' });
        const fileFixture = "import a from './level0'";
        helper.createFile('', 'file1.js', fileFixture);
        helper.createFile('', 'file2.js', fileFixture);
        helper.addComponentWithOptions('file1.js', { i: 'comp/comp1' });
        helper.addComponentWithOptions('file2.js', { i: 'comp/comp2' });
        helper.commitAllComponents();
        helper.exportAllComponents();
        helper.reInitLocalScope();
        helper.addRemoteScope();
        myBitJsonPath = path.join(helper.localScopePath, 'bit.json');
        helper.addBitJsonDependencies(myBitJsonPath, {
          [`${helper.remoteScope}/comp/comp1`]: '0.0.1',
          [`${helper.remoteScope}/comp/comp2`]: '0.0.1'
        });
        output = helper.importAllComponents(true);
        localConsumerFiles = helper.getConsumerFiles();
      });
      it('should print the imported component correctly', () => {
        expect(output).to.have.string(`${helper.remoteScope}/comp/comp1`);
        expect(output).to.have.string(`${helper.remoteScope}/comp/comp2`);
      });
      it('should link the level0 dep from the dependencies folder to the first comp', () => {
        const expectedLocation = path.join('components', 'comp', 'comp1', 'level0.js');
        expect(localConsumerFiles).to.include(expectedLocation);
        const linkFilePath = path.join(helper.localScopePath, expectedLocation);
        const linkFilePathContent = fs.readFileSync(linkFilePath).toString();
        const requireLink = `../../.dependencies/dep/level0/${helper.remoteScope}/0.0.1/level0`;
        expect(linkFilePathContent).to.have.string(requireLink);
      });
      it('should link the level0 dep from the dependencies folder to the second comp', () => {
        const expectedLocation = path.join('components', 'comp', 'comp2', 'level0.js');
        expect(localConsumerFiles).to.include(expectedLocation);
        const linkFilePath = path.join(helper.localScopePath, expectedLocation);
        const linkFilePathContent = fs.readFileSync(linkFilePath).toString();
        const requireLink = `../../.dependencies/dep/level0/${helper.remoteScope}/0.0.1/level0`;
        expect(linkFilePathContent).to.have.string(requireLink);
      });

      it('should create an index.js file on the level0 dependency root dir pointing to the main file', () => {
        const expectedLocation = path.join(
          'components',
          '.dependencies',
          'dep',
          'level0',
          helper.remoteScope,
          '0.0.1',
          'index.js'
        );
        expect(localConsumerFiles).to.include(expectedLocation);
        const indexPath = path.join(helper.localScopePath, expectedLocation);
        const indexFileContent = fs.readFileSync(indexPath).toString();
        expect(indexFileContent).to.have.string(
          "module.exports = require('./level0');",
          'dependency index file point to the wrong place'
        );
      });

      it('should create an index.js file on the level1 dependency root dir pointing to the main file', () => {
        const expectedLocation = path.join(
          'components',
          '.dependencies',
          'dep',
          'level1',
          helper.remoteScope,
          '0.0.1',
          'index.js'
        );
        expect(localConsumerFiles).to.include(expectedLocation);
        const indexPath = path.join(helper.localScopePath, expectedLocation);
        const indexFileContent = fs.readFileSync(indexPath).toString();
        expect(indexFileContent).to.have.string(
          "module.exports = require('./level1');",
          'dependency index file point to the wrong place'
        );
      });

      it('should save the direct dependency in the components/.dependencies directory', () => {
        const expectedLocation = path.join(
          'components',
          '.dependencies',
          'dep',
          'level0',
          helper.remoteScope,
          '0.0.1',
          'level0.js'
        );
        expect(localConsumerFiles).to.include(expectedLocation);
      });

      it('should save the indirect dependency in the components/.dependencies directory (same as direct dependency)', () => {
        const expectedLocation = path.join(
          'components',
          '.dependencies',
          'dep',
          'level1',
          helper.remoteScope,
          '0.0.1',
          'level1.js'
        );
        expect(localConsumerFiles).to.include(expectedLocation);
      });

      it('should link the level1 dep from the level0 dep', () => {
        const expectedLocation = path.join(
          'components',
          '.dependencies',
          'dep',
          'level0',
          helper.remoteScope,
          '0.0.1',
          'level1.js'
        );
        expect(localConsumerFiles).to.include(expectedLocation);
        const linkFilePath = path.join(helper.localScopePath, expectedLocation);
        const linkFilePathContent = fs.readFileSync(linkFilePath).toString();
        const requireLink = `../../../level1/${helper.remoteScope}/0.0.1/level1`;
        expect(linkFilePathContent).to.have.string(requireLink);
      });
    });
  });

  describe("component which require another component's internal (not main) file", () => {
    describe('javascript without compiler', () => {
      before(() => {
        helper.setNewLocalAndRemoteScopes();

        helper.createFile('utils', 'is-type-internal.js', fixtures.isType);
        const isTypeMainFixture = "module.exports = require('./is-type-internal');";
        helper.createFile('utils', 'is-type-main.js', isTypeMainFixture);
        helper.addComponentWithOptions('utils/is-type-internal.js utils/is-type-main.js', {
          m: 'utils/is-type-main.js',
          i: 'utils/is-type'
        });

        const isStringInternalFixture =
          "const isType = require('./is-type-internal.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
        helper.createFile('utils', 'is-string-internal.js', isStringInternalFixture);
        const isStringMainFixture =
          "const isType = require('./is-type-main.js'); module.exports = require('./is-string-internal');";
        helper.createFile('utils', 'is-string-main.js', isStringMainFixture);
        helper.addComponentWithOptions('utils/is-string-internal.js utils/is-string-main.js', {
          m: 'utils/is-string-main.js',
          i: 'utils/is-string'
        });

        helper.commitAllComponents();
        helper.exportAllComponents();
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('utils/is-string');
      });
      it('should be able to require the main and the internal files and print the results', () => {
        const appJsFixture = "const isString = require('./components/utils/is-string'); console.log(isString());";
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string');
      });
    });

    describe.skip('javascript with compiler', () => {});

    describe.skip('typescript without compiler', () => {});
  });

  describe("component's with bit.json and packages dependencies", () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();

      // export a new simple component
      helper.addNpmPackage('lodash.isboolean', '3.0.0');
      const simpleFixture = 'import a from "lodash.isboolean"; ';
      helper.createFile('global', 'simple.js', simpleFixture);
      helper.addComponentWithOptions('global/simple.js', { i: 'global/simple' });
      helper.commitComponent('simple');
      helper.exportComponent('simple');

      helper.addNpmPackage('lodash.isstring', '4.0.0');
      const withDepsFixture = 'import a from "./global/simple.js"; import c from "lodash.isstring"';
      helper.createFile('', 'with-deps.js', withDepsFixture);
      helper.addComponentWithOptions('with-deps.js', { i: 'comp/with-deps' });
      helper.commitAllComponents();
      helper.exportComponent('comp/with-deps');
    });

    describe('with one dependency', () => {
      let output;
      let bitMap;
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        output = helper.importComponent('comp/with-deps');
        bitMap = helper.readBitMap();
      });

      it('should add all missing components to bit.map file', () => {
        expect(bitMap).to.have.property(`${helper.remoteScope}/global/simple${VERSION_DELIMITER}0.0.1`);
      });
      it('should mark direct dependencies as "IMPORTED" in bit.map file', () => {
        expect(bitMap[`${helper.remoteScope}/comp/with-deps${VERSION_DELIMITER}0.0.1`].origin).to.equal('IMPORTED');
      });
      it('should mark indirect dependencies as "NESTED" in bit.map file', () => {
        expect(bitMap[`${helper.remoteScope}/global/simple${VERSION_DELIMITER}0.0.1`].origin).to.equal('NESTED');
      });
      it.skip('should not add existing components to bit.map file', () => {});
      it.skip('should create bit.json file with all the dependencies in the folder', () => {});
      it('should print a successful message about installed npm packages', () => {
        expect(output).to.have.string('successfully ran npm install');
      });
      it('should write the dependency in the dependencies directory', () => {
        const depDir = path.join(
          helper.localScopePath,
          'components',
          '.dependencies',
          'global',
          'simple',
          helper.remoteScope,
          '0.0.1',
          'global',
          'simple.js'
        );
        expect(fs.existsSync(depDir)).to.be.true;
      });
      it('should write a package.json in the component dir', () => {
        const packageJsonPath = path.join(helper.localScopePath, 'components', 'comp', 'with-deps', 'package.json');
        expect(fs.existsSync(packageJsonPath)).to.be.true;
        const packageJsonContent = fs.readJsonSync(packageJsonPath);
        expect(packageJsonContent).to.deep.include({
          name: `@bit/${helper.remoteScope}.comp.with-deps`,
          version: '0.0.1',
          main: 'with-deps.js'
        });
        expect(packageJsonContent.dependencies['lodash.isstring']).to.have.string('4.0.0'); // it can be ^4.0.0 or 4.0.0 depends on npm version installed
      });
      it('should write a package.json in the nested dependency component dir', () => {
        const packageJsonPath = path.join(
          helper.localScopePath,
          'components',
          '.dependencies',
          'global',
          'simple',
          helper.remoteScope,
          '0.0.1',
          'package.json'
        );
        expect(fs.existsSync(packageJsonPath)).to.be.true;
        const packageJsonContent = fs.readJsonSync(packageJsonPath);
        expect(packageJsonContent).to.deep.include({
          name: `@bit/${helper.remoteScope}.global.simple`,
          version: '0.0.1',
          main: 'global/simple.js'
        });
        expect(packageJsonContent.dependencies['lodash.isboolean']).to.have.string('3.0.0');
      });

      it.skip('should write the dependencies according to their relative paths', () => {});
    });

    describe('with --ignore-package-json flag', () => {
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponentWithOptions('comp/with-deps', { '-ignore-package-json': '' });
      });
      it('should not write a package.json in the component dir', () => {
        const packageJsonPath = path.join(helper.localScopePath, 'components', 'comp', 'with-deps', 'package.json');
        expect(fs.existsSync(packageJsonPath)).to.be.false;
      });
      it('should not write a package.json in the nested dependency component dir', () => {
        const packageJsonPath = path.join(
          helper.localScopePath,
          'components',
          '.dependencies',
          'global',
          'simple',
          helper.remoteScope,
          '0.0.1',
          'package.json'
        );
        expect(fs.existsSync(packageJsonPath)).to.be.false;
      });
    });

    describe('with --skip-npm-install flag', () => {
      let output;
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        output = helper.importComponentWithOptions('comp/with-deps', { '-skip-npm-install': '' });
      });
      it('should print warning for missing package dependencies', () => {
        expect(output).to.have.string(
          'error - missing the following package dependencies. please install and add to package.json.'
        );
        expect(output).to.have.string('lodash.isboolean: 3.0.0');
        expect(output).to.have.string('lodash.isstring: 4.0.0');
      });
    });
  });

  describe('components with auto-resolve dependencies', () => {
    /**
     * Directory structure of the author
     * bar/foo.js
     * utils/is-string.js
     * utils/is-type.js
     *
     * bar/foo depends on utils/is-string.
     * utils/is-string depends on utils/is-type
     *
     * Expected structure after importing bar/foo in another project
     * components/bar/foo/bar/foo.js
     * components/bar/foo/index.js (generated index file)
     * components/bar/foo/utils/is-string.js (generated link file)
     * components/.dependencies/utils/is-string/scope-name/version-number/utils/index.js (generated index file - point to is-string.js)
     * components/.dependencies/utils/is-string/scope-name/version-number/utils/is-string.js
     * components/.dependencies/utils/is-string/scope-name/version-number/utils/is-type.js (generated link file)
     * components/.dependencies/utils/is-type/scope-name/version-number/utils/index.js (generated index file - point to is-type.js)
     * components/.dependencies/utils/is-type/scope-name/version-number/utils/is-type.js
     *
     */
    let localConsumerFiles;
    let clonedLocalScope;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.addComponent('utils/is-type.js');
      helper.createFile('utils', 'is-string.js', fixtures.isString);
      helper.addComponent('utils/is-string.js');
      helper.createComponentBarFoo(fixtures.barFooFixture);
      helper.addComponentBarFoo();
      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
      clonedLocalScope = helper.cloneLocalScope();
      localConsumerFiles = helper.getConsumerFiles();
    });
    it('should keep the original directory structure of the main component', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'bar', 'foo.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should be able to require its direct dependency and print results from all dependencies', () => {
      const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
    describe('when cloning the project to somewhere else without component files. (component files are not under git)', () => {
      before(() => {
        helper.mimicGitCloneLocalProject(false);
        helper.addRemoteScope();
      });
      describe('and running bit import without "--write" flag', () => {
        before(() => {
          helper.importAllComponents();
          localConsumerFiles = helper.getConsumerFiles();
        });
        it('should not write the components files', () => {
          localConsumerFiles.forEach((file) => {
            expect(file).to.not.startsWith('components');
          });
        });
      });
      describe('and running bit import with "--write" flag', () => {
        before(() => {
          helper.runCmd('bit import --write --force');
        });
        it('should write the components files back', () => {
          const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo());";
          fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
          const result = helper.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type and got is-string and got foo');
        });
      });
    });
    describe('when cloning the project to somewhere else with component files (component files are under git)', () => {
      before(() => {
        helper.getClonedLocalScope(clonedLocalScope);
        helper.createFile('components/bar/foo/bar', 'foo.js', fixtures.barFooFixtureV2);
        helper.mimicGitCloneLocalProject();
        helper.addRemoteScope();
      });
      it('local scope should be empty', () => {
        const output = helper.listLocalScope();
        expect(output).to.have.string('found 0 components in local scope');
      });
      describe('after running bit import (without --write flag)', () => {
        before(() => {
          helper.importAllComponents();
        });
        it('local scope should contain all the components', () => {
          const output = helper.listLocalScope();
          expect(output).to.have.string('found 3 components in local scope');
        });
        it('should not override the current files', () => {
          // as opposed to running import without '--write', the files should remain intact
          const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo());";
          fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
          const result = helper.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type and got is-string and got foo v2');
        });
      });
    });
    describe('re-import with a specific path', () => {
      before(() => {
        helper.getClonedLocalScope(clonedLocalScope);
        helper.importComponent('bar/foo -p new-location');
        localConsumerFiles = helper.getConsumerFiles();
      });
      it('should move the component directory to the new location', () => {
        const newLocation = path.join('new-location', 'bar', 'foo.js');
        const oldLocation = path.join('components', 'bar', 'foo', 'bar', 'foo.js');
        expect(localConsumerFiles).to.include(newLocation);
        expect(localConsumerFiles).not.to.include(oldLocation);
      });
      it('should update the rootDir in bit.map to the new location', () => {
        const bitMap = helper.readBitMap();
        const componentMap = bitMap[`${helper.remoteScope}/bar/foo@0.0.1`];
        expect(componentMap.rootDir).to.equal('new-location');
      });
      it('should be able to require its direct dependency and print results from all dependencies', () => {
        const appJsFixture = "const barFoo = require('./new-location'); console.log(barFoo());";
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
    });
  });

  describe('components with auto-resolve dependencies using css', () => {
    /**
     * Directory structure of the author
     * bar/foo.js
     * style/style.css
     *
     * bar/foo depends on style/style.css.
     *
     * Expected structure after importing bar/foo in another project
     * components/bar/foo/bar/foo.js
     * components/bar/foo/index.js (generated index file)
     * components/bar/foo/style/style.css (generated link file)
     * components/.dependencies/style/style/scope-name/version-number/style/index.css (generated index file - point to is-string.js)
     * components/.dependencies/style/style/scope-name/version-number/style/style.css
     *
     */
    let localConsumerFiles;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('style', 'style.css');
      helper.addComponent('style/style.css');
      const fooBarFixture = "const style = require('../style/style.css');";
      helper.createFile('bar', 'foo.js', fooBarFixture);
      helper.addComponent('bar/foo.js');
      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
      localConsumerFiles = helper.getConsumerFiles('*.*');
    });
    it('should keep the original directory structure of the main component', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'bar', 'foo.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should create an index.css file on the style dependency root dir pointing to the main file', () => {
      const expectedLocation = path.join(
        'components',
        '.dependencies',
        'style',
        'style',
        helper.remoteScope,
        '0.0.1',
        'index.css'
      );
      expect(localConsumerFiles).to.include(expectedLocation);
      const indexPath = path.join(helper.localScopePath, expectedLocation);
      const indexFileContent = fs.readFileSync(indexPath).toString();
      expect(indexFileContent).to.have.string("@import './style/style.css';");
    });
    it('should save the style dependency nested to the main component', () => {
      const expectedLocation = path.join(
        'components',
        '.dependencies',
        'style',
        'style',
        helper.remoteScope,
        '0.0.1',
        'style',
        'style.css'
      );
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should link the style dependency to its original location', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'style', 'style.css');
      expect(localConsumerFiles).to.include(expectedLocation);
      const indexPath = path.join(helper.localScopePath, expectedLocation);
      const indexFileContent = fs.readFileSync(indexPath).toString();
      expect(indexFileContent).to.have.string(
        `@import '../../../.dependencies/style/style/${helper.remoteScope}/0.0.1/style/style.css';`
      );
    });
  });

  describe('components with auto-resolve dependencies using TypeScript', () => {
    /**
     * Directory structure of the author
     * bar/foo.ts
     * utils/is-string.ts
     * utils/is-type.ts
     *
     * bar/foo depends on utils/is-string.
     * utils/is-string depends on utils/is-type
     *
     * Expected structure after importing bar/foo in another project
     * components/bar/foo/bar/foo.ts
     * components/bar/foo/index.ts (generated index file)
     * components/bar/foo/utils/is-string.ts (generated link file)
     * components/.dependencies/utils/is-string/scope-name/version-number/utils/index.ts (generated index file - point to is-string.js)
     * components/.dependencies/utils/is-string/scope-name/version-number/utils/is-string.ts
     * components/.dependencies/utils/is-string/scope-name/version-number/utils/is-type.ts (generated link file)
     * components/.dependencies/utils/is-type/scope-name/version-number/utils/index.ts (generated index file - point to is-type.js)
     * components/.dependencies/utils/is-type/scope-name/version-number/utils/is-type.ts
     *
     */
    let localConsumerFiles;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const isTypeFixtureTS = "export = isType; function isType() { return 'got is-type'; };";
      helper.createFile('utils', 'is-type.ts', isTypeFixtureTS);
      helper.addComponent('utils/is-type.ts');
      const isStringFixtureTS =
        "import * as isType from './is-type'; export = isString; function isString() { return isType() +  ' and got is-string'; };";
      helper.createFile('utils', 'is-string.ts', isStringFixtureTS);
      helper.addComponent('utils/is-string.ts');
      const fooBarFixture =
        "import * as isString from '../utils/is-string'; export = foo; function foo() { return isString() + ' and got foo'; };";
      helper.createFile('bar', 'foo.ts', fooBarFixture);
      helper.addComponent('bar/foo.ts');
      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
      localConsumerFiles = helper.getConsumerFiles('*.ts');
    });
    it('should keep the original directory structure of the main component', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'bar', 'foo.ts');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should create an index.ts file on the is-string dependency root dir pointing to the main file', () => {
      const expectedLocation = path.join(
        'components',
        '.dependencies',
        'utils',
        'is-string',
        helper.remoteScope,
        '0.0.1',
        'index.ts'
      );
      expect(localConsumerFiles).to.include(expectedLocation);
      const indexPath = path.join(helper.localScopePath, expectedLocation);
      const indexFileContent = fs.readFileSync(indexPath).toString();
      expect(indexFileContent).to.have.string(
        "export * from './utils/is-string';",
        'dependency index file point to the wrong place'
      );
    });
    it('should create an index.ts file on the is-type dependency root dir pointing to the main file', () => {
      const expectedLocation = path.join(
        'components',
        '.dependencies',
        'utils',
        'is-type',
        helper.remoteScope,
        '0.0.1',
        'index.ts'
      );
      expect(localConsumerFiles).to.include(expectedLocation);
      const indexPath = path.join(helper.localScopePath, expectedLocation);
      const indexFileContent = fs.readFileSync(indexPath).toString();
      expect(indexFileContent).to.have.string(
        "export * from './utils/is-type';",
        'dependency index file point to the wrong place'
      );
    });
    it('should save the direct dependency', () => {
      const expectedLocation = path.join(
        'components',
        '.dependencies',
        'utils',
        'is-string',
        helper.remoteScope,
        '0.0.1',
        'utils',
        'is-string.ts'
      );
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should save the indirect dependency', () => {
      const expectedLocation = path.join(
        'components',
        '.dependencies',
        'utils',
        'is-type',
        helper.remoteScope,
        '0.0.1',
        'utils',
        'is-type.ts'
      );
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should link the direct dependency to its original location', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'utils', 'is-string.ts');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should link the indirect dependency to its original location in the dependency directory', () => {
      const expectedLocation = path.join(
        'components',
        '.dependencies',
        'utils',
        'is-string',
        helper.remoteScope,
        '0.0.1',
        'utils',
        'is-type.ts'
      );
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it.skip('should be able to require its direct dependency and print results from all dependencies', () => {
      // need the TypeScript compiler for this
      const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
  });

  // This is one of the most important cases, because it involve a lot of working pieces from the base flow:
  // Add, build, commit, export, import, dependency resolution, index file generation
  describe('components with auto-resolve dependencies - with compiler', () => {
    /**
     * Directory structure of the author
     * bar/foo.js
     * utils/is-string.js
     * utils/is-type.js
     *
     * bar/foo depends on utils/is-string.
     * utils/is-string depends on utils/is-type
     *
     * There is babel compiler defined
     *
     * Expected structure after importing bar/foo in another project
     * components/bar/foo/bar/foo.js
     * components/bar/foo/dist/bar/foo.js
     * components/bar/foo/index.js (generated index file - point to dist/bar/foo.js)
     * components/bar/foo/utils/is-string.js (generated link file - point to index file of is-string component)
     * components/bar/foo/dist/utils/is-string.js (generated link file - point to index file of is-string component)
     * components/.dependencies/utils/is-string/scope-name/version-number/index.js (generated index file - point to dist/is-string.js)
     * components/.dependencies/utils/is-string/scope-name/version-number/utils/is-string.js
     * components/.dependencies/utils/is-string/scope-name/version-number/utils/is-type.js (generated link file which enable is-string to use is-type)
     * components/.dependencies/utils/is-string/scope-name/version-number/dist/utils/is-type.js (link file which enable is-string to use is-type)
     * components/.dependencies/utils/is-string/scope-name/version-number/dist/utils/is-string.js (compiled version)
     * components/.dependencies/utils/is-type/scope-name/version-number/index.js (generated index file - point to dist/is-type.js)
     * components/.dependencies/utils/is-type/scope-name/version-number/utils/is-type.js
     * components/.dependencies/utils/is-type/scope-name/version-number/dist/utils/is-type.js (compiled version)
     */
    let localConsumerFiles;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.importCompiler();
      const isTypeFixtureES6 = "export default function isType() { return 'got is-type'; };";
      helper.createFile('utils', 'is-type.js', isTypeFixtureES6);
      helper.addComponent('utils/is-type.js');
      const isStringFixtureES6 =
        "import isType from './is-type.js'; export default function isString() { return isType() +  ' and got is-string'; };";
      helper.createFile('utils', 'is-string.js', isStringFixtureES6);
      helper.addComponent('utils/is-string.js');
      const fooBarFixture =
        "import isString from '../utils/is-string.js'; export default function foo() { return isString() + ' and got foo'; };";
      helper.createComponentBarFoo(fooBarFixture);
      helper.addComponentBarFoo();
      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
      localConsumerFiles = helper.getConsumerFiles();
    });
    const isStringLocation = path.join(
      'components',
      '.dependencies',
      'utils',
      'is-string',
      helper.remoteScope,
      '0.0.1'
    );
    const isTypeLocation = path.join('components', '.dependencies', 'utils', 'is-type', helper.remoteScope, '0.0.1');
    it('should keep the original directory structure of the main component', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'bar', 'foo.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should create the dist files of the main component', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'dist', 'bar', 'foo.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should create an index.js file on the is-string dependency root dir pointing to the main file', () => {
      const expectedLocation = path.join(isStringLocation, 'index.js');
      expect(localConsumerFiles).to.include(expectedLocation);
      const indexPath = path.join(helper.localScopePath, expectedLocation);
      const indexFileContent = fs.readFileSync(indexPath).toString();
      expect(indexFileContent).to.have.string(
        "module.exports = require('./dist/utils/is-string');",
        'dependency index file point to the wrong place'
      );
    });
    it('should create an index.js file on the is-type dependency root dir pointing to the main file', () => {
      const expectedLocation = path.join(isTypeLocation, 'index.js');
      expect(localConsumerFiles).to.include(expectedLocation);
      const indexPath = path.join(helper.localScopePath, expectedLocation);
      const indexFileContent = fs.readFileSync(indexPath).toString();
      expect(indexFileContent).to.have.string(
        "module.exports = require('./dist/utils/is-type');",
        'dependency index file point to the wrong place'
      );
    });
    it('should save the direct dependency nested to the main component', () => {
      const expectedLocation = path.join(isStringLocation, 'utils', 'is-string.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should save the indirect dependency nested to the main component (as opposed to nested of nested)', () => {
      const expectedLocation = path.join(isTypeLocation, 'utils', 'is-type.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should add dependencies dists files to file system', () => {
      const expectedIsTypeDistLocation = path.join(isTypeLocation, 'dist', 'utils', 'is-type.js');
      const expectedIsStringDistLocation = path.join(isStringLocation, 'dist', 'utils', 'is-string.js');
      expect(localConsumerFiles).to.include(expectedIsTypeDistLocation);
      expect(localConsumerFiles).to.include(expectedIsStringDistLocation);
    });
    it('should link the direct dependency to its index file from main component source folder', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'utils', 'is-string.js');
      const linkPath = path.join(helper.localScopePath, expectedLocation);
      const linkPathContent = fs.readFileSync(linkPath).toString();
      const expectedPathSuffix = normalize(
        path.join('.dependencies', 'utils', 'is-string', helper.remoteScope, '0.0.1', 'utils', 'is-string')
      );
      expect(localConsumerFiles).to.include(expectedLocation);
      expect(linkPathContent).to.have.string(
        `../../../${expectedPathSuffix}`,
        'dependency link file point to the wrong place'
      );
    });
    it('should link the direct dependency to its index file from main component dist folder', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'dist', 'utils', 'is-string.js');
      const linkPath = path.join(helper.localScopePath, expectedLocation);
      const linkPathContent = fs.readFileSync(linkPath).toString();
      const expectedPathSuffix = normalize(
        path.join('.dependencies', 'utils', 'is-string', helper.remoteScope, '0.0.1')
      );
      expect(localConsumerFiles).to.include(expectedLocation);
      expect(linkPathContent).to.have.string(
        `../../../../${expectedPathSuffix}`,
        'dependency link file point to the wrong place'
      );
    });
    it('should link the indirect dependency from dependent component source folder to its index file in the dependency directory', () => {
      const expectedLocation = path.join(isStringLocation, 'utils', 'is-type.js');
      const linkPath = path.join(helper.localScopePath, expectedLocation);
      const linkPathContent = fs.readFileSync(linkPath).toString();
      const expectedPathSuffix = normalize(path.join('is-type', helper.remoteScope, '0.0.1', 'utils', 'is-type'));
      expect(localConsumerFiles).to.include(expectedLocation);
      expect(linkPathContent).to.have.string(
        `'../../../../${expectedPathSuffix}`,
        'in direct dependency link file point to the wrong place'
      );
    });
    it('should link the indirect dependency from dependent component dist folder to its index file in the dependency directory', () => {
      const expectedLocation = path.join(isStringLocation, 'dist', 'utils', 'is-type.js');
      const linkPath = path.join(helper.localScopePath, expectedLocation);
      const linkPathContent = fs.readFileSync(linkPath).toString();
      const expectedPathSuffix = normalize(path.join('is-type', helper.remoteScope, '0.0.1'));
      expect(localConsumerFiles).to.include(expectedLocation);
      expect(linkPathContent).to.have.string(
        `../../../../../${expectedPathSuffix}`,
        'in direct dependency link file point to the wrong place'
      );
    });
    it('should be able to require its direct dependency and print results from all dependencies', () => {
      const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo.default());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
    describe('importing with --ignore-dist flag', () => {
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/foo --ignore-dist');
        localConsumerFiles = helper.getConsumerFiles();
      });
      it('should not write anything to the dist folder of the main component', () => {
        const distFolder = path.join('components', 'bar', 'foo', 'dist');
        localConsumerFiles.forEach(file => expect(file).to.not.have.string(distFolder));
      });
      it('main property of package.json file should point to the source and not to the dist', () => {
        const packageJson = helper.readPackageJson(path.join(helper.localScopePath, 'components', 'bar', 'foo'));
        expect(packageJson.main).to.equal('bar/foo.js');
      });
      describe('bit build after importing without --ignore-dist flag', () => {
        before(() => {
          helper.build('bar/foo');

          const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo.default());";
          fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        });
        it('main index file should point to the dist and not to the source', () => {
          const indexFile = path.join(helper.localScopePath, 'components', 'bar', 'foo', 'index.js');
          const indexFileContent = fs.readFileSync(indexFile).toString();
          expect(indexFileContent).to.have.string("require('./dist/bar/foo')");
        });
        it('package.json main attribute should point to the main dist file', () => {
          const packageJsonFile = path.join(helper.localScopePath, 'components', 'bar', 'foo');
          const packageJson = helper.readPackageJson(packageJsonFile);
          expect(packageJson.main).to.equal('dist/bar/foo.js');
        });
        it('should generate all the links in the dists directory and be able to require its direct dependency', () => {
          const result = helper.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type and got is-string and got foo');
        });
        describe('bit build all', () => {
          before(() => {
            fs.removeSync(path.join(helper.localScopePath, 'components', 'bar', 'foo', 'dist'));
            helper.build();
          });
          it('should build the imported component although it was not modified', () => {
            const result = helper.runCmd('node app.js');
            expect(result.trim()).to.equal('got is-type and got is-string and got foo');
          });
        });
      });
    });
    describe('re-import with a specific path', () => {
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/foo');
        helper.importComponent('bar/foo -p new-location');
        localConsumerFiles = helper.getConsumerFiles();
      });
      it('should move the component directory to the new location', () => {
        const newLocation = path.join('new-location', 'bar', 'foo.js');
        const oldLocation = path.join('components', 'bar', 'foo', 'bar', 'foo.js');
        expect(localConsumerFiles).to.include(newLocation);
        expect(localConsumerFiles).not.to.include(oldLocation);
      });
      it('should update the rootDir in bit.map to the new location', () => {
        const bitMap = helper.readBitMap();
        const componentMap = bitMap[`${helper.remoteScope}/bar/foo@0.0.1`];
        expect(componentMap.rootDir).to.equal('new-location');
      });
      it('should be able to require its direct dependency and print results from all dependencies', () => {
        const appJsFixture = `const barFoo = require('${helper.getRequireBitPath('bar', 'foo')}');
console.log(barFoo.default());`;
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
    });
  });

  describe('modifying a dependent and a dependency at the same time', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.addComponent('utils/is-type.js');
      helper.createFile('utils', 'is-string.js', fixtures.isString);
      helper.addComponent('utils/is-string.js');
      helper.commitAllComponents();

      const isTypeFixtureV2 = "module.exports = function isType() { return 'got is-type v2'; };";
      helper.createFile('utils', 'is-type.js', isTypeFixtureV2); // modify is-type
      const isStringFixtureV2 =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string v2'; };";
      helper.createFile('utils', 'is-string.js', isStringFixtureV2); // modify is-string

      helper.commitAllComponents();
      helper.exportAllComponents();

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('utils/is-string');
    });
    it('the dependent should have the updated version of the dependency', () => {
      const output = helper.showComponentParsed('utils/is-string');
      expect(output.dependencies[0].id).to.have.string('is-type@0.0.2');
    });
    it('should use the updated dependent and dependencies and print the results from the latest versions', () => {
      const appJsFixture = "const isString = require('./components/utils/is-string'); console.log(isString());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type v2 and got is-string v2');
    });
  });

  describe('to an inner directory (not consumer root)', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.exportAllComponents();

      helper.reInitLocalScope();
      helper.addRemoteScope();

      const pathToRunImportFrom = path.join(helper.localScopePath, 'utils');
      fs.ensureDirSync(pathToRunImportFrom);
      helper.runCmd(`bit import ${helper.remoteScope}/bar/foo`, pathToRunImportFrom);
    });
    it('should import to the consumer root directory as if the command was running from the root', () => {
      const expectedLocation = path.join(helper.localScopePath, 'components', 'bar', 'foo', 'foo.js');
      expect(fs.existsSync(expectedLocation)).to.be.true;
    });
  });

  describe('importing v1 of a component when a component has v2', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.reInitRemoteScope();
      helper.addRemoteScope();
      helper.importCompiler();

      const isTypeFixtureV1 = "module.exports = function isType() { return 'got is-type v1'; };";
      helper.createFile('utils', 'is-type.js', isTypeFixtureV1);
      helper.addComponent('utils/is-type.js');
      helper.commitComponent('utils/is-type');
      const isTypeFixtureV2 = "module.exports = function isType() { return 'got is-type v2'; };";
      helper.createFile('utils', 'is-type.js', isTypeFixtureV2); // modify is-type
      helper.commitComponent('utils/is-type');
      helper.exportAllComponents();

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('utils/is-type@0.0.1');
    });
    it('should not show the component as modified or staged', () => {
      const statusOutput = helper.runCmd('bit status');
      expect(statusOutput.includes('no new components')).to.be.true;
      expect(statusOutput.includes('no modified components')).to.be.true;
      expect(statusOutput.includes('no staged components')).to.be.true;
    });
    describe('then importing v2', () => {
      before(() => {
        helper.importComponent('utils/is-type@0.0.2');
      });
      it('should imported v2 successfully and print the result from the latest version', () => {
        const appJsFixture = "const isType = require('./components/utils/is-type'); console.log(isType());";
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type v2'); // notice the "v2"
      });
      it('should update the existing record in bit.map', () => {
        const bitMap = helper.readBitMap();
        expect(bitMap).to.have.property(`${helper.remoteScope}/utils/is-type@0.0.2`);
      });
      it('should not create a new record in bit.map', () => {
        const bitMap = helper.readBitMap();
        expect(bitMap).to.not.have.property(`${helper.remoteScope}/utils/is-type@0.0.1`);
      });
    });
  });

  describe('after adding dependencies to an imported component with relative syntax', () => {
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const isStringWithNoDepsFixture = "module.exports = function isString() { return 'got is-string'; };";
      helper.createFile('utils', 'is-string.js', isStringWithNoDepsFixture);
      helper.addComponent('utils/is-string.js');
      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('utils/is-string');

      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.addComponent('utils/is-type.js');
      const isStringWithDepsFixture =
        "const isType = require('../../../utils/is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createFile('components/utils/is-string', 'is-string.js', isStringWithDepsFixture); // modify utils/is-string
      try {
        output = helper.commitAllComponents();
      } catch (err) {
        output = err.toString();
      }
    });
    it('should not allow tagging the component', () => {
      expect(output).to.have.string('fatal: issues found with the following component dependencies');
      expect(output).to.have.string('relative components (should be absolute)');
      expect(output).to.have.string('utils/is-type');
    });
  });

  describe('import the same component ("is-type") as an indirect dependency (of "is-string") and as a direct dependency', () => {
    let localConsumerFiles;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.addComponent(path.normalize('utils/is-type.js'));
      helper.createFile('utils', 'is-string.js', fixtures.isString);
      helper.addComponent(path.normalize('utils/is-string.js'));
      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      const bitJson = helper.readBitJson();
      bitJson.dependencies[`${helper.remoteScope}/utils/is-string`] = '0.0.1';
      bitJson.dependencies[`${helper.remoteScope}/utils/is-type`] = '0.0.1';
      helper.writeBitJson(bitJson);
      helper.importAllComponents(true);
      localConsumerFiles = helper.getConsumerFiles();
    });
    it('should write is-type directly in components directory', () => {
      const expectedLocation = path.join('components', 'utils', 'is-type', 'is-type.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should not write is-type in the dependencies directory', () => {
      const expectedLocation = path.join(
        'components',
        '.dependencies',
        'utils',
        'is-type',
        helper.remoteScope,
        '0.0.1',
        'utils',
        'is-type.js'
      );
      expect(localConsumerFiles).to.not.include(expectedLocation);
    });
    it('should show is-type as a dependency of is-string in bit.map', () => {
      const bitMap = helper.readBitMap();
      const isTypeDependency = `${helper.remoteScope}/utils/is-type@0.0.1`;
      expect(bitMap[`${helper.remoteScope}/utils/is-string@0.0.1`].dependencies).to.include(isTypeDependency);
    });
    it('should successfully require is-type dependency and print the results from both components', () => {
      const appJsFixture = "const isString = require('./components/utils/is-string'); console.log(isString());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string');
    });
  });

  describe('import the same component ("is-type") as an indirect dependency (of "is-string") and as a direct dependency with a newer version', () => {
    // in other words, is-type@0.0.1 is a direct dependency of is-string, and the bit.json have these two components:
    // is-string@0.0.1 and is-type@0.0.2. After the import we expect to have both is-type versions (1 and 2), and is-string to
    // work with the v1 of is-type.
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const isTypeFixtureV1 = "module.exports = function isType() { return 'got is-type v1'; };";
      helper.createFile('utils', 'is-type.js', isTypeFixtureV1);
      helper.addComponent(path.normalize('utils/is-type.js'));
      helper.createFile('utils', 'is-string.js', fixtures.isString);
      helper.addComponent(path.normalize('utils/is-string.js'));
      helper.commitAllComponents();

      const isTypeFixtureV2 = "module.exports = function isType() { return 'got is-type v2'; };";
      helper.createFile('utils', 'is-type.js', isTypeFixtureV2); // update component
      helper.commitAllComponents();

      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();

      const bitJson = helper.readBitJson();
      bitJson.dependencies[`${helper.remoteScope}/utils/is-string`] = '0.0.1';
      bitJson.dependencies[`${helper.remoteScope}/utils/is-type`] = '0.0.2';
      helper.writeBitJson(bitJson);
      helper.importAllComponents(true);
    });
    it('should successfully print results of is-type@0.0.1 when requiring it indirectly by is-string', () => {
      const requirePath = helper.getRequireBitPath('utils', 'is-string');
      const appJsFixture = `const isString = require('${requirePath}'); console.log(isString());`;
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type v1 and got is-string');
    });
    it('should successfully print results of is-type@0.0.2 when requiring it directly', () => {
      const requirePath = helper.getRequireBitPath('utils', 'is-type');
      const appJsFixture = `const isType = require('${requirePath}'); console.log(isType());`;
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type v2');
    });
  });

  describe('creating two components: "is-type" and "is-string" while "is-string" depends on "is-type"', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.addComponent(path.normalize('utils/is-type.js'));
      helper.createFile('utils', 'is-string.js', fixtures.isString);
      helper.addComponent(path.normalize('utils/is-string.js'));
      helper.commitAllComponents();
      helper.exportAllComponents();
    });
    describe('import is-type as a dependency and then import it directly', () => {
      let localConsumerFiles;
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('utils/is-string'); // imports is-type as a dependency
        helper.importComponent('utils/is-type');
        localConsumerFiles = helper.getConsumerFiles();
      });
      it('should rewrite is-type directly into "components" directory', () => {
        const expectedLocation = path.join('components', 'utils', 'is-type', 'is-type.js');
        expect(localConsumerFiles).to.include(expectedLocation);
      });
      it('should update the existing record of is-type in bit.map from NESTED to IMPORTED', () => {
        const bitMap = helper.readBitMap();
        expect(bitMap).to.have.property(`${helper.remoteScope}/utils/is-type@0.0.1`);
        expect(bitMap[`${helper.remoteScope}/utils/is-type@0.0.1`].origin).to.equal('IMPORTED');
      });
      it('should not show any component in bit status', () => {
        const output = helper.runCmd('bit status');
        expect(output).to.not.have.a.string('utils/is-string');
        expect(output).to.not.have.a.string('utils/is-type');
        expect(output).to.have.a.string('no new components');
        expect(output).to.have.a.string('no modified components');
        expect(output).to.have.a.string('no staged components');
        expect(output).to.have.a.string('no deleted components');
        expect(output).to.have.a.string('no auto-tag pending components');
      });
      it('should not break the is-string component', () => {
        const isTypeFixtureV2 = "module.exports = function isType() { return 'got is-type v2'; };";
        helper.createFile(path.join('components', 'utils', 'is-type'), 'is-type.js', isTypeFixtureV2);

        const appJsFixture = "const isString = require('./components/utils/is-string'); console.log(isString());";
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type v2 and got is-string');
      });
    });
    describe('import is-type directly and then as a dependency', () => {
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('utils/is-type');
        helper.importComponent('utils/is-string'); // imports is-type as a dependency
      });
      it('should keep the existing record of is-type in bit.map as IMPORTED', () => {
        const bitMap = helper.readBitMap();
        expect(bitMap).to.have.property(`${helper.remoteScope}/utils/is-type@0.0.1`);
        expect(bitMap[`${helper.remoteScope}/utils/is-type@0.0.1`].origin).to.equal('IMPORTED');
      });
      it('changes of is-type in components directory should affect is-string', () => {
        const isTypeFixtureV2 = "module.exports = function isType() { return 'got is-type v2'; };";
        helper.createFile(path.join('components', 'utils', 'is-type'), 'is-type.js', isTypeFixtureV2);

        const appJsFixture = "const isString = require('./components/utils/is-string'); console.log(isString());";
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type v2 and got is-string');
      });
    });
  });

  describe('import component with dependencies from scope A, modify and export them to scope B, then import to a new local scope', () => {
    let scopeB;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.addComponent('utils/is-type.js');
      helper.createFile('utils', 'is-string.js', fixtures.isString);
      helper.addComponent('utils/is-string.js');
      helper.commitAllComponents();
      // export to scope A
      helper.exportAllComponents();
      // import to a new local scope
      helper.initNewLocalScope();
      helper.addRemoteScope();
      helper.importComponent('utils/is-string');
      // modify the component
      const isStringModifiedFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string v2'; };";
      const componentPath = path.join('components', 'utils', 'is-string');
      helper.createFile(componentPath, 'is-string.js', isStringModifiedFixture);
      helper.commitComponent('utils/is-string');
      // export to scope B
      const { scopeName, scopePath } = helper.getNewBareScope();
      scopeB = scopeName;
      helper.addRemoteScope(scopePath);
      helper.exportComponent(`${helper.remoteScope}/utils/is-string@0.0.2`, scopeB);
      // import to a new local scope
      helper.initNewLocalScope();
      helper.addRemoteScope(scopePath);
      helper.runCmd(`bit import ${scopeB}/utils/is-string`);
    });
    it('should export the component successfully to scope B', () => {
      const output = helper.runCmd(`bit list ${scopeB}`);
      expect(output.includes('found 1 components')).to.be.true;
      expect(output.includes('utils/is-string')).to.be.true;
    });
    it('should import the component successfully from scope B to a new local scope', () => {
      const appJsFixture = "const isString = require('./components/utils/is-string'); console.log(isString());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string v2');
    });
  });

  describe('import component with dependencies, modify and export, then author import the updated version', () => {
    let localConsumerFiles;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.addComponent('utils/is-type.js');
      helper.createFile('utils', 'is-string.js', fixtures.isString);
      helper.addComponent('utils/is-string.js');
      helper.commitAllComponents();
      helper.exportAllComponents();
      const authorScope = helper.localScope;

      helper.initNewLocalScope(false);
      helper.addRemoteScope();
      helper.importComponent('utils/is-string');
      // modify the component
      const isStringModifiedFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string v2'; };";
      const componentPath = path.join('components', 'utils', 'is-string');
      helper.createFile(componentPath, 'is-string.js', isStringModifiedFixture);
      helper.commitComponent('utils/is-string');
      helper.exportComponent(`${helper.remoteScope}/utils/is-string@0.0.2`);

      fs.removeSync(helper.localScopePath);
      helper.setLocalScope(authorScope);
      helper.importComponent('utils/is-string');
      localConsumerFiles = glob
        .sync(path.normalize('**/*.js'), { cwd: helper.localScopePath })
        .map(x => path.normalize(x));
    });
    it('should update the author original component successfully', () => {
      const appJsFixture = "const isString = require('./utils/is-string'); console.log(isString());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string v2');
    });
    it('should not write any file into components directory', () => {
      localConsumerFiles.forEach((fileName) => {
        expect(fileName.startsWith('components')).to.be.false;
      });
    });
  });

  describe('import a component when the local version is modified', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
      const barFooFixtureV2 = "module.exports = function foo() { return 'got foo v2'; };";
      helper.createFile(path.join('components', 'bar', 'foo'), 'foo.js', barFooFixtureV2);

      const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
    });
    describe('without --force flag', () => {
      let output;
      before(() => {
        try {
          helper.importComponent('bar/foo');
        } catch (err) {
          output = err.toString();
        }
      });
      it('should display a warning saying it was unable to import', () => {
        expect(output).to.have.string('unable to import');
      });
      it('should not override the local changes', () => {
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got foo v2');
      });
    });
    describe('with --force flag', () => {
      let output;
      before(() => {
        output = helper.importComponent('bar/foo --force');
      });
      it('should display a successful message', () => {
        expect(output).to.have.string('successfully imported');
      });
      it('should override the local changes', () => {
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got foo');
      });
    });
  });

  describe('component with shared directory across files and dependencies', () => {
    /**
     * Directory structure of the author
     * src/bar/foo.js
     * src/utils/is-string.js
     * src/utils/is-type.js
     *
     * bar/foo depends on utils/is-string.
     * utils/is-string depends on utils/is-type
     *
     * Expected structure after importing bar/foo in another project.
     * components/bar/foo/bar/foo.js (Notice how the 'src' directory is gone)
     * components/bar/foo/index.js (generated index file)
     * components/bar/foo/utils/is-string.js (generated link file)
     * components/.dependencies/utils/is-string/scope-name/version-number/src/utils/index.js (generated index file - point to is-string.js)
     * components/.dependencies/utils/is-string/scope-name/version-number/src/utils/is-string.js
     * components/.dependencies/utils/is-string/scope-name/version-number/src/utils/is-type.js (generated link file)
     * components/.dependencies/utils/is-type/scope-name/version-number/src/utils/index.js (generated index file - point to is-type.js)
     * components/.dependencies/utils/is-type/scope-name/version-number/src/utils/is-type.js
     *
     */
    let localConsumerFiles;
    let clonedScope;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile(path.join('src', 'utils'), 'is-type.js', fixtures.isType);
      helper.addComponent('src/utils/is-type.js');
      helper.createFile(path.join('src', 'utils'), 'is-string.js', fixtures.isString);
      helper.addComponent('src/utils/is-string.js');
      const fooBarFixture =
        "const isString = require('../utils/is-string.js'); module.exports = function foo() { return isString() + ' and got foo'; };";
      helper.createComponentBarFoo(fooBarFixture);
      helper.createFile(path.join('src', 'bar'), 'foo.js', fooBarFixture);
      helper.addComponent('src/bar/foo.js');
      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      clonedScope = helper.cloneLocalScope();
      helper.importComponent('bar/foo');
      localConsumerFiles = helper.getConsumerFiles('*.{js,json}');
    });
    it('should change the original directory structure of the main component and remove the shared directory', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'bar', 'foo.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should create a package.json file on the component root dir', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'package.json');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should be able to require its direct dependency and print results from all dependencies', () => {
      const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
    it('should not show any of the components as new or modified or deleted or staged', () => {
      const output = helper.runCmd('bit status');
      expect(output.includes('no new components')).to.be.true;
      expect(output.includes('no modified components')).to.be.true;
      expect(output.includes('no staged components')).to.be.true;
      expect(output.includes('no deleted components')).to.be.true;
    });
    describe('when cloning the project to somewhere else', () => {
      before(() => {
        helper.mimicGitCloneLocalProject(false);
        helper.addRemoteScope();
        helper.runCmd('bit import --write --force');
      });
      it('should be able to require its direct dependency and print results from all dependencies', () => {
        const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo());";
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
    });
    describe('re-import with a specific path', () => {
      before(() => {
        helper.importComponent('bar/foo -p new-location');
        localConsumerFiles = helper.getConsumerFiles();
      });
      it('should move the component directory to the new location', () => {
        const newLocation = path.join('new-location', 'bar', 'foo.js');
        const oldLocation = path.join('components', 'bar', 'foo', 'bar', 'foo.js');
        expect(localConsumerFiles).to.include(newLocation);
        expect(localConsumerFiles).not.to.include(oldLocation);
      });
      it('should be able to require its direct dependency and print results from all dependencies', () => {
        const appJsFixture = "const barFoo = require('./new-location'); console.log(barFoo());";
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
    });
    describe('import a component and then its dependency directly', () => {
      // this covers several bugs found when there is originallySharedDir, a component is imported
      // and after that its dependency is imported directly.
      let output;
      before(() => {
        helper.getClonedLocalScope(clonedScope);
        helper.importComponent('bar/foo');
        output = helper.importComponent('utils/is-string');
      });
      it('should import the dependency successfully', () => {
        expect(output).to.have.string('successfully imported one component');
      });
    });
  });
  describe('import component with dependencies with yarn workspaces', () => {
    let dependencies;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      dependencies = path.join(
        helper.localScopePath,
        'components',
        '.dependencies',
        'global',
        'simple',
        helper.remoteScope,
        '0.0.1'
      );
      helper.addNpmPackage('lodash.isboolean', '3.0.0');
      const simpleFixture = 'import a from "lodash.isboolean"; ';
      helper.createFile('global', 'simple.js', simpleFixture);
      helper.addComponentWithOptions('global/simple.js', { i: 'global/simple' });
      helper.commitComponent('simple');
      helper.exportComponent('simple');
      helper.addNpmPackage('lodash.isstring', '4.0.0');
      const withDepsFixture = 'import a from "./global/simple.js"; import c from "lodash.isstring"';
      helper.createFile('', 'with-deps.js', withDepsFixture);
      helper.addComponentWithOptions('with-deps.js', { i: 'comp/with-deps' });
      helper.commitAllComponents();
      helper.exportComponent('comp/with-deps');
      helper.reInitLocalScope();
      helper.addRemoteScope(helper.remoteScopePath);
      helper.manageWorkspaces();
      helper.importComponent('comp/with-deps');
      helper.addKeyValueToPackageJson({ customField: 'bit is awsome' });
    });
    it('should install component dependencie as separate packages with yarn workspaces', () => {
      expect(dependencies).to.be.a.directory('should not be empty').and.not.empty;
    });
    it('Should contain yarn lock file', () => {
      expect(path.join(helper.localScopePath, 'yarn.lock')).to.be.a.file('no yarn lock file');
    });
    it('should install  global/simple package dependencies with yarn', () => {
      expect(path.join(helper.localScopePath, 'node_modules')).to.be.a.directory('should not be empty').and.not.empty;
      expect(path.join(helper.localScopePath, 'node_modules', 'lodash.isboolean')).to.be.a.directory(
        'should contain lodash.isboolean'
      ).and.not.empty;
    });
    it('should contain  workspaces array in package.json  and private true', () => {
      const pkgJson = helper.readPackageJson(helper.localScopePath);
      expect(pkgJson.workspaces).to.include('components/.dependencies/*/*/*/*', 'components/*/*');
      expect(pkgJson.private).to.be.true;
    });
    it('component dep should be install as npm package', () => {
      const modulePath = path.join(
        helper.localScopePath,
        'node_modules',
        '@bit',
        `${helper.remoteScope}.global.simple`
      );
      expect(modulePath).to.be.a.directory('should contain component dep as npm package dep').and.not.empty;
    });
    it('Should not contain duplicate regex in workspaces dir if we run import again ', () => {
      helper.importComponent('comp/with-deps -f');
      const pkgJson = helper.readPackageJson(helper.localScopePath);
      expect(pkgJson.workspaces).to.include('components/.dependencies/*/*/*/*', 'components/*/*');
      expect(pkgJson.workspaces).to.be.ofSize(2);
      expect(path.join(helper.localScopePath, 'yarn.lock')).to.be.a.file('no yarn lock file');
    });
    it('Should not delete custom fields in package.json', () => {
      helper.importComponent('comp/with-deps -f');
      const pkgJson = helper.readPackageJson();
      expect(pkgJson).to.have.property('customField');
      expect(pkgJson.customField).to.equal('bit is awsome');
    });
    it('Should not delete delete workspaces that already existed in package.json', () => {
      helper.addKeyValueToPackageJson({ workspaces: ['comp'] });
      helper.importComponent('comp/with-deps -f');
      const pkgJson = helper.readPackageJson();
      expect(pkgJson.workspaces).to.include(
        'components/.dependencies/*/*/*/*',
        'components/*/*',
        'test/comp/with-deps'
      );
    });
    it('Should save workspaces with custom import path ', () => {
      helper.reInitLocalScope();
      helper.addRemoteScope(helper.remoteScopePath);
      helper.manageWorkspaces();
      helper.importComponent('comp/with-deps -p test');
      const pkgJson = helper.readPackageJson();
      expect(pkgJson.workspaces).to.include('components/.dependencies/*/*/*/*', 'components/*/*', 'test');
    });
  });
  describe.skip('Import compiler', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.addRemoteScope();
    });
    it('should install package dependencies', () => {});
  });

  describe.skip('Import tester', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.addRemoteScope();
    });
    it('should install package dependencies', () => {});
  });
});
