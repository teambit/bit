// covers also init, create, commit, modify commands
import { expect } from 'chai';
import path from 'path';
import fs from 'fs-extra';
import glob from 'glob';
import normalize from 'normalize-path';
import Helper, { VERSION_DELIMITER } from '../e2e-helper';
import { AUTO_GENERATED_MSG } from '../../src/constants';

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
      helper.runCmd('bit create simple');
      helper.commitComponent('simple');
      helper.exportComponent('simple');

      helper.reInitLocalScope();
      helper.addRemoteScope();
      const output = helper.importComponent('global/simple');
      expect(output.includes('successfully imported one component')).to.be.true;
      expect(output.includes('global/simple')).to.be.true;
    });
    it.skip(
      'should throw an error if there is already component with the same name and namespace and different scope',
      () => {}
    );
    it('should add the component to bit.json file', () => {
      const bitJson = helper.readBitJson();
      const depName = [helper.remoteScope, 'global', 'simple'].join('/');
      expect(bitJson.dependencies).to.include({ [depName]: '1' });
    });
    it('should add the component into bit.map file with the full id', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property(`${helper.remoteScope}/global/simple${VERSION_DELIMITER}1`);
    });
    // TODO: Validate all files exists in a folder with the component name
    it('should write the component to default path from bit.json', () => {
      // TODO: check few cases with different structure props - namespace, name, version, scope
      const expectedLocation = path.join(helper.localScopePath, 'components', 'global', 'simple', 'impl.js');
      expect(fs.existsSync(expectedLocation)).to.be.true;
    });

    describe('with multiple files located in different directories', () => {
      before(() => {
        helper.createComponent('src', 'imprel.js');
        helper.createComponent('src', 'imprel.spec.js');
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
        const expectedLocationImprel = path.join(
          helper.localScopePath,
          'components',
          'imprel',
          'imprel',
          'src',
          'imprel.js'
        );
        const expectedLocationImprelSpec = path.join(
          helper.localScopePath,
          'components',
          'imprel',
          'imprel',
          'src',
          'imprel.spec.js'
        );
        const expectedLocationMyUtil = path.join(
          helper.localScopePath,
          'components',
          'imprel',
          'imprel',
          'src',
          'utils',
          'myUtil.js'
        );
        expect(fs.existsSync(expectedLocationImprel)).to.be.true;
        expect(fs.existsSync(expectedLocationImprelSpec)).to.be.true;
        expect(fs.existsSync(expectedLocationMyUtil)).to.be.true;
      });
    });

    describe('with a specific path, using -p flag', () => {
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.runCmd(`bit import ${helper.remoteScope}/global/simple -p my-custom-location`);
      });
      it('should write the component to the specified path', () => {
        const expectedLocation = path.join(helper.localScopePath, 'my-custom-location', 'impl.js');
        expect(fs.existsSync(expectedLocation)).to.be.true;
      });

      it('should write the internal files according to their relative paths', () => {});
    });

    describe('with compiler and tests', () => {
      describe('with multiple files located in different directories', () => {
        const expectedLocationImprel = path.join(
          helper.localScopePath,
          'components',
          'imprel',
          'impreldist',
          'src',
          'imprel.js'
        );
        const expectedLocationImprelSpec = path.join(
          helper.localScopePath,
          'components',
          'imprel',
          'impreldist',
          'src',
          'imprel.spec.js'
        );
        const expectedLocationMyUtil = path.join(
          helper.localScopePath,
          'components',
          'imprel',
          'impreldist',
          'src',
          'utils',
          'myUtil.js'
        );
        const expectedLocationImprelDist = path.join(
          helper.localScopePath,
          'components',
          'imprel',
          'impreldist',
          'dist',
          'src',
          'imprel.js'
        );
        const expectedLocationImprelSpecDist = path.join(
          helper.localScopePath,
          'components',
          'imprel',
          'impreldist',
          'dist',
          'src',
          'imprel.spec.js'
        );
        const expectedLocationMyUtilDist = path.join(
          helper.localScopePath,
          'components',
          'imprel',
          'impreldist',
          'dist',
          'src',
          'utils',
          'myUtil.js'
        );
        before(() => {
          helper.importCompiler();
          helper.createComponent('src', 'imprel.js');
          helper.createComponent('src', 'imprel.spec.js');
          helper.createFile('src/utils', 'myUtil.js');
          helper.runCmd(
            'bit add src/imprel.js src/utils/myUtil.js -t src/imprel.spec.js -m src/imprel.js -i imprel/impreldist'
          );
          helper.commitComponent('imprel/impreldist');
          helper.exportComponent('imprel/impreldist');
          helper.reInitLocalScope();
          helper.addRemoteScope();
          const output = helper.importComponent('imprel/impreldist');
          expect(output.includes('successfully imported one component')).to.be.true;
          expect(output.includes('imprel/imprel')).to.be.true;
        });
        it('should write the internal files according to their relative paths', () => {
          expect(fs.existsSync(expectedLocationImprel)).to.be.true;
          expect(fs.existsSync(expectedLocationImprelSpec)).to.be.true;
          expect(fs.existsSync(expectedLocationMyUtil)).to.be.true;
        });
        it('should write the dist files in the component root dir', () => {
          expect(fs.existsSync(expectedLocationImprelDist)).to.be.true;
          expect(fs.existsSync(expectedLocationImprelSpecDist)).to.be.true;
          expect(fs.existsSync(expectedLocationMyUtilDist)).to.be.true;
        });
        describe('when a project is cloned somewhere else', () => {
          before(() => {
            helper.mimicGitCloneLocalProject();
          });
          it('should write the internal files according to their relative paths', () => {
            expect(fs.existsSync(expectedLocationImprel)).to.be.true;
            expect(fs.existsSync(expectedLocationImprelSpec)).to.be.true;
            expect(fs.existsSync(expectedLocationMyUtil)).to.be.true;
          });
          it('should write the dist files in the component root dir', () => {
            expect(fs.existsSync(expectedLocationImprelDist)).to.be.true;
            expect(fs.existsSync(expectedLocationImprelSpecDist)).to.be.true;
            expect(fs.existsSync(expectedLocationMyUtilDist)).to.be.true;
          });
        });
      });
      it.skip('should not install envs when not requested', () => {});
      it.skip('should install envs when requested (-e)', () => {});
      it.skip('should create bit.json file with envs in the folder', () => {});
    });
  });
  describe('import deprecated component', () => {
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponent('src', 'imprel.js');
      helper.createComponent('src', 'imprel.spec.js');
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
      expect(output.includes('imprel/imprel@1  [Deprecated]')).to.be.true;
    });
  });

  describe('with an existing component in bit.map', () => {
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
    it('should not write any file into components directory', () => {
      localConsumerFiles.forEach((fileName) => {
        expect(fileName.startsWith('components')).to.be.false;
      });
    });
    it('should not create any link file', () => {
      localConsumerFiles.forEach((fileName) => {
        expect(fileName.includes('index.js')).to.be.false;
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
          [`${helper.remoteScope}/comp/comp1`]: '1',
          [`${helper.remoteScope}/comp/comp2`]: '1'
        });
        output = helper.runCmd('bit import');
        localConsumerFiles = helper.getConsumerFiles();
      });
      it('should print the imported component correctly', () => {
        expect(output).to.have.string(`${helper.remoteScope}/comp/comp1`);
        expect(output).to.have.string(`${helper.remoteScope}/comp/comp2`);
      });

      it('should create an index.js file on the first component root dir pointing to the main file', () => {
        const expectedLocation = path.join('components', 'comp', 'comp1', 'index.js');
        expect(localConsumerFiles).to.include(expectedLocation);
        const indexPath = path.join(helper.localScopePath, expectedLocation);
        const indexFileContent = fs.readFileSync(indexPath).toString();
        expect(indexFileContent).to.have.string(
          "module.exports = require('./file1');",
          'index file point to the wrong place'
        );
      });

      it('should create an index.js file on the second component root dir pointing to the main file', () => {
        const expectedLocation = path.join('components', 'comp', 'comp2', 'index.js');
        expect(localConsumerFiles).to.include(expectedLocation);
        const indexPath = path.join(helper.localScopePath, expectedLocation);
        const indexFileContent = fs.readFileSync(indexPath).toString();
        expect(indexFileContent).to.have.string(
          "module.exports = require('./file2');",
          'index file point to the wrong place'
        );
      });

      it('should link the level0 dep from the dependencies folder to the first comp', () => {
        const expectedLocation = path.join('components', 'comp', 'comp1', 'level0.js');
        expect(localConsumerFiles).to.include(expectedLocation);
        const linkFilePath = path.join(helper.localScopePath, expectedLocation);
        const linkFilePathContent = fs.readFileSync(linkFilePath).toString();
        const requireLink = `../../.dependencies/dep/level0/${helper.remoteScope}/1/index`;
        expect(linkFilePathContent).to.have.string(
          `module.exports = require('${requireLink}');`,
          'link file point to the wrong place'
        );
      });
      it('should add to link file msg that explains that it was generated', () => {
        const expectedLocation = path.join('components', 'comp', 'comp1', 'index.js');
        const linkFilePath = path.join(helper.localScopePath, expectedLocation);
        const linkFilePathContent = fs.readFileSync(linkFilePath).toString();
        expect(linkFilePathContent).to.have.string(AUTO_GENERATED_MSG);
      });

      it('should link the level0 dep from the dependencies folder to the second comp', () => {
        const expectedLocation = path.join('components', 'comp', 'comp2', 'level0.js');
        expect(localConsumerFiles).to.include(expectedLocation);
        const linkFilePath = path.join(helper.localScopePath, expectedLocation);
        const linkFilePathContent = fs.readFileSync(linkFilePath).toString();
        const requireLink = `../../.dependencies/dep/level0/${helper.remoteScope}/1/index`;
        expect(linkFilePathContent).to.have.string(
          `module.exports = require('${requireLink}');`,
          'link file point to the wrong place'
        );
      });

      it('should create an index.js file on the level0 dependency root dir pointing to the main file', () => {
        const expectedLocation = path.join(
          'components',
          '.dependencies',
          'dep',
          'level0',
          helper.remoteScope,
          '1',
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
          '1',
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
          '1',
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
          '1',
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
          '1',
          'level1.js'
        );
        expect(localConsumerFiles).to.include(expectedLocation);
        const linkFilePath = path.join(helper.localScopePath, expectedLocation);
        const linkFilePathContent = fs.readFileSync(linkFilePath).toString();
        const requireLink = `../../../level1/${helper.remoteScope}/1/index`;
        expect(linkFilePathContent).to.have.string(
          `module.exports = require('${requireLink}');`,
          'link file point to the wrong place'
        );
      });
    });
  });

  describe("component which require another component's internal (not main) file", () => {
    describe('javascript without compiler', () => {
      let localConsumerFiles;
      before(() => {
        helper.setNewLocalAndRemoteScopes();

        const isTypeInternalFixture = "module.exports = function isType() { return 'got is-type'; };";
        helper.createComponent('utils', 'is-type-internal.js', isTypeInternalFixture);
        const isTypeMainFixture = "module.exports = require('./is-type-internal');";
        helper.createComponent('utils', 'is-type-main.js', isTypeMainFixture);
        helper.addComponentWithOptions('utils/is-type-internal.js utils/is-type-main.js', {
          m: 'utils/is-type-main.js',
          i: 'utils/is-type'
        });

        const isStringInternalFixture =
          "const isType = require('./is-type-internal.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
        helper.createComponent('utils', 'is-string-internal.js', isStringInternalFixture);
        const isStringMainFixture =
          "const isType = require('./is-type-main.js'); module.exports = require('./is-string-internal');";
        helper.createComponent('utils', 'is-string-main.js', isStringMainFixture);
        helper.addComponentWithOptions('utils/is-string-internal.js utils/is-string-main.js', {
          m: 'utils/is-string-main.js',
          i: 'utils/is-string'
        });

        helper.commitAllComponents();
        helper.exportAllComponents();
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('utils/is-string');
        localConsumerFiles = helper.getConsumerFiles();
      });

      it('should create a link file to the dependency main file', () => {
        const expectedLocation = path.join('components', 'utils', 'is-string', 'utils', 'is-type-main.js');
        expect(localConsumerFiles).to.include(expectedLocation);
        const linkPath = path.join(helper.localScopePath, expectedLocation);
        const linkFileContent = fs.readFileSync(linkPath).toString();
        const requirePath = `../../../.dependencies/utils/is-type/${helper.remoteScope}/1/index`;
        expect(linkFileContent).to.have.string(
          `module.exports = require('${requirePath}');`,
          'link file point to the wrong place'
        );
      });

      it('should create a link file to the dependency internal file', () => {
        const expectedLocation = path.join('components', 'utils', 'is-string', 'utils', 'is-type-internal.js');
        expect(localConsumerFiles).to.include(expectedLocation);
        const linkPath = path.join(helper.localScopePath, expectedLocation);
        const linkFileContent = fs.readFileSync(linkPath).toString();
        const requirePath = `../../../.dependencies/utils/is-type/${helper.remoteScope}/1/utils/is-type-internal`;
        expect(linkFileContent).to.have.string(
          `module.exports = require('${requirePath}');`,
          'link file point to the wrong place'
        );
      });
    });

    describe.skip('javascript with compiler', () => {});

    describe.skip('typescript without compiler', () => {});
  });

  describe("component's with bit.json and packages dependencies", () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();

      // export a new simple component
      const simpleFixture = 'import a from "my-package"; ';
      helper.createFile('global', 'simple.js', simpleFixture);
      helper.addNpmPackage('my-package', '1.0.1');
      helper.addComponentWithOptions('global/simple.js', { i: 'global/simple' });
      helper.commitComponent('simple');
      helper.exportComponent('simple');

      helper.addNpmPackage('some-package', '1.4.3');
      const withDepsFixture = 'import a from "./global/simple.js"; import c from "some-package"';
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
        expect(bitMap).to.have.property(`${helper.remoteScope}/global/simple${VERSION_DELIMITER}1`);
      });
      it('should mark direct dependencies as "IMPORTED" in bit.map file', () => {
        expect(bitMap[`${helper.remoteScope}/comp/with-deps${VERSION_DELIMITER}1`].origin).to.equal('IMPORTED');
      });
      it('should mark indirect dependencies as "NESTED" in bit.map file', () => {
        expect(bitMap[`${helper.remoteScope}/global/simple${VERSION_DELIMITER}1`].origin).to.equal('NESTED');
      });
      it.skip('should not add existing components to bit.map file', () => {});
      it.skip('should create bit.json file with all the dependencies in the folder', () => {});
      it('should print warning for missing package dependencies', () => {
        expect(
          output.includes('error - missing the following package dependencies. please install and add to package.json.')
        ).to.be.true;
        expect(output.includes('my-package: 1.0.1')).to.be.true;
        expect(output.includes('some-package: 1.4.3')).to.be.true;
      });
      it('should write the dependency in the dependencies directory', () => {
        const depDir = path.join(
          helper.localScopePath,
          'components',
          '.dependencies',
          'global',
          'simple',
          helper.remoteScope,
          '1',
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
          name: 'comp-with-deps',
          version: '1.0.0',
          main: 'with-deps.js',
          dependencies: { 'some-package': '1.4.3' }
        });
      });
      it('should write a package.json in the nested dependency component dir', () => {
        const packageJsonPath = path.join(
          helper.localScopePath,
          'components',
          '.dependencies',
          'global',
          'simple',
          helper.remoteScope,
          '1',
          'package.json'
        );
        expect(fs.existsSync(packageJsonPath)).to.be.true;
        const packageJsonContent = fs.readJsonSync(packageJsonPath);
        expect(packageJsonContent).to.deep.include({
          name: 'global-simple',
          version: '1.0.0',
          main: 'global/simple.js',
          dependencies: { 'my-package': '1.0.1' }
        });
      });

      it.skip('should write the dependencies according to their relative paths', () => {});
    });

    describe('with no_package_json flag', () => {
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponentWithOptions('comp/with-deps', { '-no_package_json': '' });
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
          '1',
          'package.json'
        );
        expect(fs.existsSync(packageJsonPath)).to.be.false;
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
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
      const isStringFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');
      const fooBarFixture =
        "const isString = require('../utils/is-string.js'); module.exports = function foo() { return isString() + ' and got foo'; };";
      helper.createComponentBarFoo(fooBarFixture);
      helper.addComponentBarFoo();
      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
      localConsumerFiles = helper.getConsumerFiles();
    });
    it('should keep the original directory structure of the main component', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'bar', 'foo.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should create an index.js file on the component root dir pointing to the main file', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'index.js');
      expect(localConsumerFiles).to.include(expectedLocation);
      const indexPath = path.join(helper.localScopePath, expectedLocation);
      const indexFileContent = fs.readFileSync(indexPath).toString();
      expect(indexFileContent).to.have.string(
        "module.exports = require('./bar/foo');",
        'index file point to the wrong place'
      );
    });
    it('should be able to require its direct dependency and print results from all dependencies', () => {
      const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
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
      helper.createComponent('style', 'style.css');
      helper.addComponent('style/style.css');
      const fooBarFixture = "const style = require('../style/style.css');";
      helper.createComponent('bar', 'foo.js', fooBarFixture);
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
    it('should create an index.js file on the component root dir pointing to the main file', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'index.js');
      expect(localConsumerFiles).to.include(expectedLocation);
      const indexPath = path.join(helper.localScopePath, expectedLocation);
      const indexFileContent = fs.readFileSync(indexPath).toString();
      expect(indexFileContent).to.have.string(
        "module.exports = require('./bar/foo');",
        'index file point to the wrong place'
      );
    });
    it('should create an index.css file on the style dependency root dir pointing to the main file', () => {
      const expectedLocation = path.join(
        'components',
        '.dependencies',
        'style',
        'style',
        helper.remoteScope,
        '1',
        'index.css'
      );
      expect(localConsumerFiles).to.include(expectedLocation);
      const indexPath = path.join(helper.localScopePath, expectedLocation);
      const indexFileContent = fs.readFileSync(indexPath).toString();
      expect(indexFileContent).to.have.string(
        "@import './style/style.css';",
        'dependency index file point to the wrong place'
      );
    });
    it('should save the style dependency nested to the main component', () => {
      const expectedLocation = path.join(
        'components',
        '.dependencies',
        'style',
        'style',
        helper.remoteScope,
        '1',
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
        `@import '../../../.dependencies/style/style/${helper.remoteScope}/1/index.css';`,
        'dependency link file point to the wrong place'
      );
    });
  });

  describe('components with auto-resolve dependencies using TypeScript', () => {
    // Skipping this test on appveyor because it's fail due to madge issues
    if (process.env.APPVEYOR === 'True') {
      this.skip;
    } else {
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
        const isTypeFixture = "export = isType; function isType() { return 'got is-type'; };";
        helper.createComponent('utils', 'is-type.ts', isTypeFixture);
        helper.addComponent('utils/is-type.ts');
        const isStringFixture =
          "import * as isType from './is-type'; export = isString; function isString() { return isType() +  ' and got is-string'; };";
        helper.createComponent('utils', 'is-string.ts', isStringFixture);
        helper.addComponent('utils/is-string.ts');
        const fooBarFixture =
          "import * as isString from '../utils/is-string'; export = foo; function foo() { return isString() + ' and got foo'; };";
        helper.createComponent('bar', 'foo.ts', fooBarFixture);
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
      it('should create an index.ts file on the component root dir pointing to the main file', () => {
        const expectedLocation = path.join('components', 'bar', 'foo', 'index.ts');
        expect(localConsumerFiles).to.include(expectedLocation);
        const indexPath = path.join(helper.localScopePath, expectedLocation);
        const indexFileContent = fs.readFileSync(indexPath).toString();
        expect(indexFileContent).to.have.string("export * from './bar/foo';", 'index file point to the wrong place');
      });
      it('should create an index.ts file on the is-string dependency root dir pointing to the main file', () => {
        const expectedLocation = path.join(
          'components',
          '.dependencies',
          'utils',
          'is-string',
          helper.remoteScope,
          '1',
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
          '1',
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
          '1',
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
          '1',
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
          '1',
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
    }
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
      const isTypeFixture = "export default function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
      const isStringFixture =
        "import isType from './is-type.js'; export default function isString() { return isType() +  ' and got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
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
    it('should keep the original directory structure of the main component', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'bar', 'foo.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should create the dist files of the main component', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'dist', 'bar', 'foo.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should create an index.js file on the component root dir pointing to the main file', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'index.js');
      expect(localConsumerFiles).to.include(expectedLocation);
      const indexPath = path.join(helper.localScopePath, expectedLocation);
      const indexFileContent = fs.readFileSync(indexPath).toString();
      expect(indexFileContent).to.have.string(
        "module.exports = require('./dist/bar/foo');",
        'index file point to the wrong place'
      );
    });
    it('should create an index.js file on the is-string dependency root dir pointing to the main file', () => {
      const expectedLocation = path.join(
        'components',
        '.dependencies',
        'utils',
        'is-string',
        helper.remoteScope,
        '1',
        'index.js'
      );
      expect(localConsumerFiles).to.include(expectedLocation);
      const indexPath = path.join(helper.localScopePath, expectedLocation);
      const indexFileContent = fs.readFileSync(indexPath).toString();
      expect(indexFileContent).to.have.string(
        "module.exports = require('./dist/utils/is-string');",
        'dependency index file point to the wrong place'
      );
    });
    it('should create an index.js file on the is-type dependency root dir pointing to the main file', () => {
      const expectedLocation = path.join(
        'components',
        '.dependencies',
        'utils',
        'is-type',
        helper.remoteScope,
        '1',
        'index.js'
      );
      expect(localConsumerFiles).to.include(expectedLocation);
      const indexPath = path.join(helper.localScopePath, expectedLocation);
      const indexFileContent = fs.readFileSync(indexPath).toString();
      expect(indexFileContent).to.have.string(
        "module.exports = require('./dist/utils/is-type');",
        'dependency index file point to the wrong place'
      );
    });
    it('should save the direct dependency nested to the main component', () => {
      const expectedLocation = path.join(
        'components',
        '.dependencies',
        'utils',
        'is-string',
        helper.remoteScope,
        '1',
        'utils',
        'is-string.js'
      );
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should save the indirect dependency nested to the main component (as opposed to nested of nested)', () => {
      const expectedLocation = path.join(
        'components',
        '.dependencies',
        'utils',
        'is-type',
        helper.remoteScope,
        '1',
        'utils',
        'is-type.js'
      );
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should add dependencies dists files to file system', () => {
      const expectedIsTypeDistLocation = path.join(
        'components',
        '.dependencies',
        'utils',
        'is-type',
        helper.remoteScope,
        '1',
        'dist',
        'utils',
        'is-type.js'
      );
      const expectedIsStringDistLocation = path.join(
        'components',
        '.dependencies',
        'utils',
        'is-string',
        helper.remoteScope,
        '1',
        'dist',
        'utils',
        'is-string.js'
      );
      expect(localConsumerFiles).to.include(expectedIsTypeDistLocation);
      expect(localConsumerFiles).to.include(expectedIsStringDistLocation);
    });
    it('should link the direct dependency to its index file from main component source folder', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'utils', 'is-string.js');
      const linkPath = path.join(helper.localScopePath, expectedLocation);
      const linkPathContent = fs.readFileSync(linkPath).toString();
      const expectedPathSuffix = normalize(
        path.join('.dependencies', 'utils', 'is-string', helper.remoteScope, '1', 'index')
      );
      expect(localConsumerFiles).to.include(expectedLocation);
      expect(linkPathContent).to.have.string(
        `module.exports = require('../../../${expectedPathSuffix}');`,
        'dependency link file point to the wrong place'
      );
    });
    it('should link the direct dependency to its index file from main component dist folder', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'dist', 'utils', 'is-string.js');
      const linkPath = path.join(helper.localScopePath, expectedLocation);
      const linkPathContent = fs.readFileSync(linkPath).toString();
      const expectedPathSuffix = normalize(
        path.join('.dependencies', 'utils', 'is-string', helper.remoteScope, '1', 'index')
      );
      expect(localConsumerFiles).to.include(expectedLocation);
      expect(linkPathContent).to.have.string(
        `module.exports = require('../../../../${expectedPathSuffix}');`,
        'dependency link file point to the wrong place'
      );
    });
    it('should link the indirect dependency from dependent component source folder to its index file in the dependency directory', () => {
      const expectedLocation = path.join(
        'components',
        '.dependencies',
        'utils',
        'is-string',
        helper.remoteScope,
        '1',
        'utils',
        'is-type.js'
      );
      const linkPath = path.join(helper.localScopePath, expectedLocation);
      const linkPathContent = fs.readFileSync(linkPath).toString();
      const expectedPathSuffix = normalize(path.join('is-type', helper.remoteScope, '1', 'index'));
      expect(localConsumerFiles).to.include(expectedLocation);
      expect(linkPathContent).to.have.string(
        `module.exports = require('../../../../${expectedPathSuffix}');`,
        'in direct dependency link file point to the wrong place'
      );
    });
    it('should link the indirect dependency from dependent component dist folder to its index file in the dependency directory', () => {
      const expectedLocation = path.join(
        'components',
        '.dependencies',
        'utils',
        'is-string',
        helper.remoteScope,
        '1',
        'dist',
        'utils',
        'is-type.js'
      );
      const linkPath = path.join(helper.localScopePath, expectedLocation);
      const linkPathContent = fs.readFileSync(linkPath).toString();
      const expectedPathSuffix = normalize(path.join('is-type', helper.remoteScope, '1', 'index'));
      expect(localConsumerFiles).to.include(expectedLocation);
      expect(linkPathContent).to.have.string(
        `module.exports = require('../../../../../${expectedPathSuffix}');`,
        'in direct dependency link file point to the wrong place'
      );
    });
    it('should be able to require its direct dependency and print results from all dependencies', () => {
      const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo.default());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
  });

  describe('after committing dependencies only (not dependents)', () => {
    /**
     * Directory structure of the author
     * bar/foo.js
     * utils/is-string.js
     * utils/is-type.js
     *
     * bar/foo depends on utils/is-string.
     * utils/is-string depends on utils/is-type
     *
     * We change the dependency is-type implementation. When committing this change, we expect all dependent of is-type
     * to be updated as well so then their 'dependencies' attribute includes the latest version of is-type.
     * In this case, is-string should be updated to include is-type with v2.
     */
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
      const isStringFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');
      helper.commitAllComponents();

      const isTypeFixtureV2 = "module.exports = function isType() { return 'got is-type v2'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixtureV2); // modify is-type
      helper.commitComponent('utils/is-type');
      // notice how is-string is not manually committed again!
      helper.exportAllComponents();

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('utils/is-string');
    });
    it('should use the updated dependencies and print the results from the latest versions', () => {
      const appJsFixture = "const isString = require('./components/utils/is-string'); console.log(isString());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      // notice the "v2" (!)
      expect(result.trim()).to.equal('got is-type v2 and got is-string');
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
      const expectedLocation = path.join(helper.localScopePath, 'components', 'bar', 'foo', 'bar', 'foo.js');
      expect(fs.existsSync(expectedLocation)).to.be.true;
    });
  });

  describe('v2 of a component when v1 has been imported already', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.reInitRemoteScope();
      helper.addRemoteScope();
      const isTypeFixtureV1 = "module.exports = function isType() { return 'got is-type v1'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixtureV1);
      helper.addComponent('utils/is-type.js');
      helper.commitComponent('utils/is-type');
      const isTypeFixtureV2 = "module.exports = function isType() { return 'got is-type v2'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixtureV2); // modify is-type
      helper.commitComponent('utils/is-type');
      helper.exportAllComponents();

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('utils/is-type@1');
      helper.importComponent('utils/is-type@2');
    });
    it('should imported v2 successfully and print the result from the latest version', () => {
      const appJsFixture = "const isType = require('./components/utils/is-type'); console.log(isType());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type v2'); // notice the "v2"
    });
    it('should update the existing record in bit.map', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property(`${helper.remoteScope}/utils/is-type@2`);
    });
    it('should not create a new record in bit.map', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap).to.not.have.property(`${helper.remoteScope}/utils/is-type@1`);
    });
  });

  describe('after adding dependencies to an imported component', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const isStringWithNoDepsFixture = "module.exports = function isString() { return 'got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringWithNoDepsFixture);
      helper.addComponent('utils/is-string.js');
      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('utils/is-string');

      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
      const isStringFixture =
        "const isType = require('../../../../utils/is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createComponent('components/utils/is-string/utils', 'is-string.js', isStringFixture); // modify utils/is-string
      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('utils/is-string');
    });
    it('should recognize the modified imported component and print results from its new dependencies', () => {
      const appJsFixture = "const isString = require('./components/utils/is-string'); console.log(isString());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string');
    });
  });

  describe('import the same component ("is-type") as an indirect dependency (of "is-string") and as a direct dependency', () => {
    let localConsumerFiles;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent(path.normalize('utils/is-type.js'));
      const isStringFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent(path.normalize('utils/is-string.js'));
      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      const bitJson = helper.readBitJson();
      bitJson.dependencies[`${helper.remoteScope}/utils/is-string`] = '1';
      bitJson.dependencies[`${helper.remoteScope}/utils/is-type`] = '1';
      helper.writeBitJson(bitJson);
      helper.runCmd('bit import');
      localConsumerFiles = helper.getConsumerFiles();
    });
    it('should write is-type directly in components directory', () => {
      const expectedLocation = path.join('components', 'utils', 'is-type', 'utils', 'is-type.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should not write is-type in the dependencies directory', () => {
      const expectedLocation = path.join(
        'components',
        '.dependencies',
        'utils',
        'is-type',
        helper.remoteScope,
        '1',
        'utils',
        'is-type.js'
      );
      expect(localConsumerFiles).to.not.include(expectedLocation);
    });
    it('should show is-type as a dependency of is-string in bit.map', () => {
      const bitMap = helper.readBitMap();
      const isTypeDependency = `${helper.remoteScope}/utils/is-type@1`;
      expect(bitMap[`${helper.remoteScope}/utils/is-string@1`].dependencies).to.include(isTypeDependency);
    });
    it('should successfully require is-type dependency and print the results from both components', () => {
      const appJsFixture = "const isString = require('./components/utils/is-string'); console.log(isString());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string');
    });
  });

  describe('import the same component ("is-type") as an indirect dependency (of "is-string") and as a direct dependency with a newer version', () => {
    // in other words, is-type@1 is a direct dependency of is-string, and the bit.json have these two components:
    // is-string@1 and is-type@2. After the import we expect to have both is-type versions (1 and 2), and is-string to
    // work with the v1 of is-type.
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const isTypeFixtureV1 = "module.exports = function isType() { return 'got is-type v1'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixtureV1);
      helper.addComponent(path.normalize('utils/is-type.js'));
      const isStringFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent(path.normalize('utils/is-string.js'));
      helper.commitAllComponents();

      const isTypeFixtureV2 = "module.exports = function isType() { return 'got is-type v2'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixtureV2); // update component
      helper.commitAllComponents();

      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();

      const bitJson = helper.readBitJson();
      bitJson.dependencies[`${helper.remoteScope}/utils/is-string`] = '1';
      bitJson.dependencies[`${helper.remoteScope}/utils/is-type`] = '2';
      helper.writeBitJson(bitJson);
      helper.runCmd('bit import');
    });
    it('should successfully print results of is-type@1 when requiring it indirectly by is-string', () => {
      const appJsFixture = "const isString = require('bit/utils/is-string'); console.log(isString());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type v1 and got is-string');
    });
    it('should successfully print results of is-type@2 when requiring it directly', () => {
      const appJsFixture = "const isType = require('bit/utils/is-type'); console.log(isType());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type v2');
    });
  });

  describe('import component is-type as a dependency of is-string and then import is-type directly', () => {
    let localConsumerFiles;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent(path.normalize('utils/is-type.js'));
      const isStringFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent(path.normalize('utils/is-string.js'));
      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('utils/is-string');
      helper.importComponent('utils/is-type');
      localConsumerFiles = helper.getConsumerFiles();
    });
    it('should rewrite is-type directly into "components" directory', () => {
      const expectedLocation = path.join('components', 'utils', 'is-type', 'utils', 'is-type.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should update the existing record of is-type in bit.map from NESTED to IMPORTED', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property(`${helper.remoteScope}/utils/is-type@1`);
      expect(bitMap[`${helper.remoteScope}/utils/is-type@1`].origin).to.equal('IMPORTED');
    });
    it('should not break the is-string component', () => {
      const appJsFixture = "const isString = require('./components/utils/is-string'); console.log(isString());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string');
    });
  });

  describe('import component with dependencies from scope A, modify and export them to scope B, then import to a new local scope', () => {
    let scopeB;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
      const isStringFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
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
      const componentPath = path.join('components', 'utils', 'is-string', 'utils');
      helper.createComponent(componentPath, 'is-string.js', isStringModifiedFixture);
      helper.commitComponent('utils/is-string');
      // export to scope B
      const { scopeName, scopePath } = helper.getNewBareScope();
      scopeB = scopeName;
      helper.addRemoteScope(scopePath);
      helper.exportComponent(`${helper.remoteScope}/utils/is-string@2`, scopeB);
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
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
      const isStringFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
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
      const componentPath = path.join('components', 'utils', 'is-string', 'utils');
      helper.createComponent(componentPath, 'is-string.js', isStringModifiedFixture);
      helper.commitComponent('utils/is-string');
      helper.exportComponent(`${helper.remoteScope}/utils/is-string@2`);

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
    it('should not create any link file', () => {
      localConsumerFiles.forEach((fileName) => {
        expect(fileName.includes('index.js')).to.be.false;
      });
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
