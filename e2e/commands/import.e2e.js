// covers also init, create, commit, modify commands

import { expect } from 'chai';
import path from 'path';
import fs from 'fs-extra';
import glob from 'glob';
import Helper from '../e2e-helper';

describe('bit import', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });

  describe('stand alone component (without dependencies)', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.reInitRemoteScope();
      helper.addRemoteScope();

      // export a new simple component
      helper.runCmd('bit create simple');
      helper.commitComponent('simple');
      helper.exportComponent('simple');

      helper.reInitLocalScope();
      helper.addRemoteScope();
      const output = helper.importComponent('global/simple');
      expect(output.includes('successfully imported the following Bit components')).to.be.true;
      expect(output.includes('global/simple')).to.be.true;
    });
    it.skip('should throw an error if there is already component with the same name and namespace and different scope', () => {
    });
    it('should add the component to bit.json file', () => {
      const bitJson = helper.readBitJson();
      const depName = path.join(helper.remoteScope, 'global', 'simple');
      expect(bitJson.dependencies).to.include({ [depName]: '1' });
    });
    it('should add the component into bit.map file with the full id', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property(`${helper.remoteScope}/global/simple::1`);
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
        helper.runCmd('bit add src/imprel.js src/utils/myUtil.js -t src/imprel.spec.js -m src/imprel.js -i imprel/imprel');
        helper.commitComponent('imprel/imprel');
        helper.exportComponent('imprel/imprel');
        helper.reInitLocalScope();
        helper.addRemoteScope();
        const output = helper.importComponent('imprel/imprel');
        expect(output.includes('successfully imported the following Bit components')).to.be.true;
        expect(output.includes('imprel/imprel')).to.be.true;
      });
      it('should write the internal files according to their relative paths', () => {
        const expectedLocationImprel = path.join(helper.localScopePath, 'components', 'imprel', 'imprel', 'src', 'imprel.js');
        const expectedLocationImprelSpec = path.join(helper.localScopePath, 'components', 'imprel', 'imprel', 'src', 'imprel.spec.js');
        const expectedLocationMyUtil = path.join(helper.localScopePath, 'components', 'imprel', 'imprel', 'src', 'utils', 'myUtil.js');
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

      it('should write the internal files according to their relative paths', () => {

      });
    });

    describe('with compiler and tester', () => {
      describe('with multiple files located in different directories', () => {
        before(() => {
          helper.importCompiler('bit.envs/compilers/babel4'); // TODO: should be pass nothing once it working
          helper.createComponent('src', 'imprel.js');
          helper.createComponent('src', 'imprel.spec.js');
          helper.createFile('src/utils', 'myUtil.js');
          helper.runCmd('bit add src/imprel.js src/utils/myUtil.js -t src/imprel.spec.js -m src/imprel.js -i imprel/impreldist');
          helper.commitComponent('imprel/impreldist');
          helper.exportComponent('imprel/impreldist');
          helper.reInitLocalScope();
          helper.addRemoteScope();
          const output = helper.importComponent('imprel/impreldist');
          expect(output.includes('successfully imported the following Bit components')).to.be.true;
          expect(output.includes('imprel/imprel')).to.be.true;
        });
        it('should write the internal files according to their relative paths', () => {
          const expectedLocationImprel = path.join(helper.localScopePath, 'components', 'imprel', 'impreldist', 'src', 'imprel.js');
          const expectedLocationImprelSpec = path.join(helper.localScopePath, 'components', 'imprel', 'impreldist', 'src', 'imprel.spec.js');
          const expectedLocationMyUtil = path.join(helper.localScopePath, 'components', 'imprel', 'impreldist', 'src', 'utils', 'myUtil.js');
          const expectedLocationImprelDist = path.join(helper.localScopePath, 'components', 'imprel', 'impreldist', 'dist', 'src', 'imprel.js');
          const expectedLocationImprelSpecDist = path.join(helper.localScopePath, 'components', 'imprel', 'impreldist', 'dist', 'src', 'imprel.spec.js');
          const expectedLocationMyUtilDist = path.join(helper.localScopePath, 'components', 'imprel', 'impreldist', 'dist', 'src', 'utils', 'myUtil.js');
          expect(fs.existsSync(expectedLocationImprel)).to.be.true;
          expect(fs.existsSync(expectedLocationImprelSpec)).to.be.true;
          expect(fs.existsSync(expectedLocationMyUtil)).to.be.true;
          expect(fs.existsSync(expectedLocationImprelDist)).to.be.true;
          expect(fs.existsSync(expectedLocationImprelSpecDist)).to.be.true;
          expect(fs.existsSync(expectedLocationMyUtilDist)).to.be.true;
        });
      });
      it.skip('should not install envs when not requested', () => {
      });
      it.skip('should install envs when requested (-e)', () => {
      });
      it.skip('should create bit.json file with envs in the folder', () => {
      });
    });
  });

  describe('with an existing component in bit.map', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.reInitRemoteScope();
      helper.addRemoteScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.exportComponent('bar/foo');
      const bitMap = helper.readBitMap();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.writeBitMap(bitMap);
      helper.importComponent('bar/foo');
    });

    // Prevent cases when I export a component with few files from different directories
    // and get it in another structure during imports (for example under components folder instead of original folder)
    it('should write the component to the paths specified in bit.map', () => {
      const expectedLocation = path.join(helper.localScopePath, 'bar', 'foo.js');      
      expect(fs.existsSync(expectedLocation)).to.be.true;
    });
  });

  describe('component/s with bit.json dependencies', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.reInitRemoteScope();
      helper.addRemoteScope();

      // export a new simple component
      helper.runCmd('bit create simple');
      helper.commitComponent('simple');
      helper.exportComponent('simple');

      // export a new component with dependencies
      helper.runCmd('bit create with-deps -j');
      const bitJsonPath = path.join(helper.localScopePath, '/components/global/with-deps/bit.json'); // TODO: Change to use the automatic deps resolver
      // add "foo" as a bit.json dependency and lodash.get as a package dependency
      helper.addBitJsonDependencies(bitJsonPath, { [`${helper.remoteScope}/global/simple`]: '1' }, { 'lodash.get': '4.4.2' });
      helper.commitComponent('with-deps');
      helper.exportComponent('with-deps');
    });

    describe('with one dependency', () => {
      let output;
      let bitMap;
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        output = helper.importComponent('global/with-deps');
        bitMap = helper.readBitMap();
      });

      it('should add all missing components to bit.map file', () => {
        expect(bitMap).to.have.property(`${helper.remoteScope}/global/simple::1`);
      });
      it('should mark direct dependencies as "IMPORTED" in bit.map file', () => {
        expect(bitMap[`${helper.remoteScope}/global/with-deps::1`].origin).to.equal('IMPORTED');
      });
      it('should mark indirect dependencies as "NESTED" in bit.map file', () => {
        expect(bitMap[`${helper.remoteScope}/global/simple::1`].origin).to.equal('NESTED');
      });
      it.skip('should not add existing components to bit.map file', () => {
      });
      it.skip('should create bit.json file with all the dependencies in the folder', () => {
      });
      it('should print warning for missing package dependencies', () => {
        expect(output.includes('Missing the following package dependencies. Please install and add to package.json')).to.be.true;
        expect(output.includes('lodash.get: 4.4.2')).to.be.true;
      });
      it('should write the dependency nested to the parent component', () => {
        const depDir = path.join(helper.localScopePath, 'components', 'global', 'with-deps',
          'dependencies', 'global', 'simple', helper.remoteScope, '1', 'impl.js');
        expect(fs.existsSync(depDir)).to.be.true;
      });

      it('should write the dependencies according to their relative paths', () => {

      });
    });
    describe('with multiple components of the same dependency', () => {
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();

        // export another component with dependencies
        helper.runCmd('bit create with-deps2 -j');
        const deps2JsonPath = path.join(helper.localScopePath, '/components/global/with-deps2/bit.json'); // TODO: Change to use the automatic deps resolver
        helper.addBitJsonDependencies(deps2JsonPath, { [`${helper.remoteScope}/global/simple`]: '1' });
        helper.commitComponent('with-deps2');
        helper.exportComponent('with-deps2');

        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('global/with-deps');
        helper.importComponent('global/with-deps2');
      });
      it('should not write again to the file system the same dependency that imported by another component', () => {
        const depDir = path.join(helper.localScopePath, 'components', 'global', 'with-deps',
          'dependencies', 'global', 'simple', helper.remoteScope, '1', 'impl.js');
        expect(fs.existsSync(depDir)).to.be.true;
        const dep2Dir = path.join(helper.localScopePath, 'components', 'global', 'with-deps2',
          'dependencies', 'global', 'simple', helper.remoteScope, '1', 'impl.js');
        expect(fs.existsSync(dep2Dir)).to.be.false;
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
     * components/bar/foo/bar/dependencies/utils/is-string/scope-name/version-number/utils/index.js (generated index file - point to is-string.js)
     * components/bar/foo/bar/dependencies/utils/is-string/scope-name/version-number/utils/is-string.js
     * components/bar/foo/bar/dependencies/utils/is-string/scope-name/version-number/utils/is-type.js (generated link file)
     * components/bar/foo/bar/dependencies/utils/is-type/scope-name/version-number/utils/index.js (generated index file - point to is-type.js)
     * components/bar/foo/bar/dependencies/utils/is-type/scope-name/version-number/utils/is-type.js
     *
     */
    let localConsumerFiles;
    before(() => {
      helper.reInitLocalScope();
      helper.reInitRemoteScope();
      helper.addRemoteScope();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
      const isStringFixture = "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');
      const fooBarFixture = "const isString = require('../utils/is-string.js'); module.exports = function foo() { return isString() + ' and got foo'; };";
      helper.createComponentBarFoo(fooBarFixture);
      helper.addComponentBarFoo();
      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
      localConsumerFiles = glob.sync('**/*.js', { cwd: helper.localScopePath });
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
      expect(indexFileContent).to.have.string('module.exports = require(\'./bar/foo.js\');', 'index file point to the wrong place');
    });
    it('should create an index.js file on the is-string dependency root dir pointing to the main file', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'dependencies', 'utils', 'is-string', helper.remoteScope, '1', 'index.js');
      expect(localConsumerFiles).to.include(expectedLocation);
      const indexPath = path.join(helper.localScopePath, expectedLocation);
      const indexFileContent = fs.readFileSync(indexPath).toString();
      expect(indexFileContent).to.have.string('module.exports = require(\'./utils/is-string.js\');', 'dependency index file point to the wrong place');
    });
    it('should create an index.js file on the is-type dependency root dir pointing to the main file', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'dependencies', 'utils', 'is-type', helper.remoteScope, '1', 'index.js');
      expect(localConsumerFiles).to.include(expectedLocation);
      const indexPath = path.join(helper.localScopePath, expectedLocation);
      const indexFileContent = fs.readFileSync(indexPath).toString();
      expect(indexFileContent).to.have.string('module.exports = require(\'./utils/is-type.js\');', 'dependency index file point to the wrong place');
    });
    it('should save the direct dependency nested to the main component', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'dependencies', 'utils',
        'is-string', helper.remoteScope, '1', 'utils', 'is-string.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should save the indirect dependency nested to the main component (as opposed to nested of nested)', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'dependencies', 'utils',
        'is-type', helper.remoteScope, '1', 'utils', 'is-type.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should link the direct dependency to its original location', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'utils', 'is-string.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should link the indirect dependency to its original location in the dependency directory', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'dependencies', 'utils',
        'is-string', helper.remoteScope, '1', 'utils', 'is-type.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should be able to require its direct dependency and print results from all dependencies', () => {
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
     * components/bar/foo/bar/dependencies/utils/is-string/scope-name/version-number/index.js (generated index file - point to dist/is-string.js)
     * components/bar/foo/bar/dependencies/utils/is-string/scope-name/version-number/utils/is-string.js
     * components/bar/foo/bar/dependencies/utils/is-string/scope-name/version-number/utils/is-type.js (generated link file which enable is-string to use is-type)
     * components/bar/foo/bar/dependencies/utils/is-string/scope-name/version-number/dist/utils/is-type.js (link file which enable is-string to use is-type)
     * components/bar/foo/bar/dependencies/utils/is-string/scope-name/version-number/dist/utils/is-string.js (compiled version)
     * components/bar/foo/bar/dependencies/utils/is-type/scope-name/version-number/index.js (generated index file - point to dist/is-type.js)
     * components/bar/foo/bar/dependencies/utils/is-type/scope-name/version-number/utils/is-type.js
     * components/bar/foo/bar/dependencies/utils/is-type/scope-name/version-number/dist/utils/is-type.js (compiled version)
     */
    let localConsumerFiles;
    before(() => {
      helper.reInitLocalScope();
      helper.reInitRemoteScope();
      helper.addRemoteScope();
      helper.importCompiler('bit.envs/compilers/babel4'); // TODO: should be pass nothing once it working
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
      const isStringFixture = "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');
      const fooBarFixture = "const isString = require('../utils/is-string.js'); module.exports = function foo() { return isString() + ' and got foo'; };";
      helper.createComponentBarFoo(fooBarFixture);
      helper.addComponentBarFoo();
      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
      localConsumerFiles = glob.sync('**/*.js', { cwd: helper.localScopePath });
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
      expect(indexFileContent).to.have.string('module.exports = require(\'./dist/bar/foo.js\');', 'index file point to the wrong place');
    });
    it('should create an index.js file on the is-string dependency root dir pointing to the main file', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'dependencies', 'utils', 'is-string', helper.remoteScope, '1', 'index.js');
      expect(localConsumerFiles).to.include(expectedLocation);
      const indexPath = path.join(helper.localScopePath, expectedLocation);
      const indexFileContent = fs.readFileSync(indexPath).toString();
      expect(indexFileContent).to.have.string('module.exports = require(\'./dist/utils/is-string.js\');', 'dependency index file point to the wrong place');
    });
    it('should create an index.js file on the is-type dependency root dir pointing to the main file', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'dependencies', 'utils', 'is-type', helper.remoteScope, '1', 'index.js');
      expect(localConsumerFiles).to.include(expectedLocation);
      const indexPath = path.join(helper.localScopePath, expectedLocation);
      const indexFileContent = fs.readFileSync(indexPath).toString();
      expect(indexFileContent).to.have.string('module.exports = require(\'./dist/utils/is-type.js\');', 'dependency index file point to the wrong place');
    });
    it('should save the direct dependency nested to the main component', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'dependencies', 'utils',
        'is-string', helper.remoteScope, '1', 'utils', 'is-string.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should save the indirect dependency nested to the main component (as opposed to nested of nested)', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'dependencies', 'utils',
        'is-type', helper.remoteScope, '1', 'utils', 'is-type.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should add dependencies dists files to file system', () => {
      const expectedIsTypeDistLocation = path.join('components', 'bar', 'foo', 'dependencies', 'utils',
        'is-type', helper.remoteScope, '1', 'dist', 'utils', 'is-type.js');
      const expectedIsStringDistLocation = path.join('components', 'bar', 'foo', 'dependencies', 'utils',
        'is-string', helper.remoteScope, '1', 'dist', 'utils', 'is-string.js');
      expect(localConsumerFiles).to.include(expectedIsTypeDistLocation);
      expect(localConsumerFiles).to.include(expectedIsStringDistLocation);
    });
    it('should link the direct dependency to its index file from main component source folder', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'utils', 'is-string.js');
      const linkPath = path.join(helper.localScopePath, expectedLocation);
      const linkPathContent = fs.readFileSync(linkPath).toString();
      const expectedPathSuffix = path.join('dependencies', 'utils', 'is-string', helper.remoteScope, '1', 'index.js');
      expect(localConsumerFiles).to.include(expectedLocation);
      expect(linkPathContent).to.have.string(`module.exports = require(\'../${expectedPathSuffix}\');`, 'dependency link file point to the wrong place');
    });
    it('should link the direct dependency to its index file from main component dist folder', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'dist', 'utils', 'is-string.js');
      const linkPath = path.join(helper.localScopePath, expectedLocation);
      const linkPathContent = fs.readFileSync(linkPath).toString();
      const expectedPathSuffix = path.join('dependencies', 'utils', 'is-string', helper.remoteScope, '1', 'index.js');
      expect(localConsumerFiles).to.include(expectedLocation);
      expect(linkPathContent).to.have.string(`module.exports = require(\'../../${expectedPathSuffix}\');`, 'dependency link file point to the wrong place');
    });
    it('should link the indirect dependency from dependent component source folder to its index file in the dependency directory', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'dependencies', 'utils',
        'is-string', helper.remoteScope, '1', 'utils', 'is-type.js');
      const linkPath = path.join(helper.localScopePath, expectedLocation);
      const linkPathContent = fs.readFileSync(linkPath).toString();
      const expectedPathSuffix = path.join('is-type', helper.remoteScope, '1', 'index.js');
      expect(localConsumerFiles).to.include(expectedLocation);
      expect(linkPathContent).to.have.string(`module.exports = require(\'../../../../${expectedPathSuffix}\');`, 'in direct dependency link file point to the wrong place');
    });
    it('should link the indirect dependency from dependent component dist folder to its index file in the dependency directory', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'dependencies', 'utils',
        'is-string', helper.remoteScope, '1', 'dist', 'utils', 'is-type.js');
      const linkPath = path.join(helper.localScopePath, expectedLocation);
      const linkPathContent = fs.readFileSync(linkPath).toString();
      const expectedPathSuffix = path.join('is-type', helper.remoteScope, '1', 'index.js');
      expect(localConsumerFiles).to.include(expectedLocation);
      expect(linkPathContent).to.have.string(`module.exports = require(\'../../../../../${expectedPathSuffix}\');`, 'in direct dependency link file point to the wrong place');
    });
    it('should be able to require its direct dependency and print results from all dependencies', () => {
      const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
  });

  describe.skip('Import compiler', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.addRemoteScope();
    });
    it('should install package dependencies', () => {
    });
  });

  describe.skip('Import tester', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.addRemoteScope();
    });
    it('should install package dependencies', () => {
    });
  });
});
