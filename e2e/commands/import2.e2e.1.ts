/* eslint-disable max-lines */

import chai, { expect } from 'chai';
import fs from 'fs-extra';
import glob from 'glob';
import * as path from 'path';
import { IssuesClasses } from '@teambit/component-issues';
import InvalidConfigPropPath from '../../src/consumer/config/exceptions/invalid-config-prop-path';
import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';
import { ComponentNotFound } from '../../src/scope/exceptions';

chai.use(require('chai-fs'));

const assertArrays = require('chai-arrays');

chai.use(assertArrays);
chai.use(require('chai-string'));

describe('bit import', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });

  after(() => {
    helper.scopeHelper.destroy();
  });

  // This is one of the most important cases, because it involve a lot of working pieces from the base flow:
  // Add, build, tag, export, import, dependency resolution, index file generation
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
    let isStringLocation;
    let isTypeLocation;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.env.importCompiler();
      helper.fs.createFile('utils', 'is-type.js', fixtures.isTypeES6);
      helper.fixtures.addComponentUtilsIsType();
      helper.fs.createFile('utils', 'is-string.js', fixtures.isStringES6);
      helper.fixtures.addComponentUtilsIsString();
      helper.fixtures.createComponentBarFoo(fixtures.barFooES6);
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');
      localConsumerFiles = helper.fs.getConsumerFiles();

      isStringLocation = path.join('components', '.dependencies', 'utils', 'is-string', helper.scopes.remote, '0.0.1');
      isTypeLocation = path.join('components', '.dependencies', 'utils', 'is-type', helper.scopes.remote, '0.0.1');
    });
    it('should keep the original directory structure of the main component', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'bar', 'foo.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should create the dist files of the main component', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'dist', 'bar', 'foo.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should not create an index.js file on the is-string dependency', () => {
      const expectedLocation = path.join(isStringLocation, 'index.js');
      expect(localConsumerFiles).not.to.include(expectedLocation);
    });
    it('should not create an index.js file on the is-type dependency', () => {
      const expectedLocation = path.join(isTypeLocation, 'index.js');
      expect(localConsumerFiles).not.to.include(expectedLocation);
    });
    it('should save the direct dependency nested to the main component', () => {
      const expectedLocation = path.join(isStringLocation, 'is-string.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should save the indirect dependency nested to the main component (as opposed to nested of nested)', () => {
      const expectedLocation = path.join(isTypeLocation, 'is-type.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should add dependencies dists files to file system', () => {
      const expectedIsTypeDistLocation = path.join(isTypeLocation, 'dist', 'is-type.js');
      const expectedIsStringDistLocation = path.join(isStringLocation, 'dist', 'is-string.js');
      expect(localConsumerFiles).to.include(expectedIsTypeDistLocation);
      expect(localConsumerFiles).to.include(expectedIsStringDistLocation);
    });
    it('should link the direct dependency to its index file from main component source folder', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'utils', 'is-string.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should link the direct dependency to its index file from main component dist folder', () => {
      const expectedLocation = path.join('components', 'bar', 'foo', 'dist', 'utils', 'is-string.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should link the indirect dependency from dependent component source folder to its index file in the dependency directory', () => {
      const expectedLocation = path.join(isStringLocation, 'is-type.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should link the indirect dependency from dependent component dist folder to its index file in the dependency directory', () => {
      const expectedLocation = path.join(isStringLocation, 'dist', 'is-type.js');
      expect(localConsumerFiles).to.include(expectedLocation);
    });
    it('should be able to require its direct dependency and print results from all dependencies', () => {
      fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), fixtures.appPrintBarFooES6);
      const result = helper.command.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
    describe('importing with --ignore-dist flag', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo --ignore-dist');
        localConsumerFiles = helper.fs.getConsumerFiles();
      });
      it('should not write anything to the dist folder of the main component', () => {
        const distFolder = path.join('components', 'bar', 'foo', 'dist');
        localConsumerFiles.forEach((file) => expect(file).to.not.have.string(distFolder));
      });
      it('main property of package.json file should point to the source and not to the dist', () => {
        const packageJson = helper.packageJson.read(path.join(helper.scopes.localPath, 'components', 'bar', 'foo'));
        expect(packageJson.main).to.equal('bar/foo.js');
      });
      describe('bit build after importing without --ignore-dist flag', () => {
        before(() => {
          helper.scopeHelper.addRemoteEnvironment();
          helper.command.build('bar/foo');

          const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo.default());";
          fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
        });
        it('package.json main attribute should point to the main dist file', () => {
          const packageJsonFile = path.join(helper.scopes.localPath, 'components', 'bar', 'foo');
          const packageJson = helper.packageJson.read(packageJsonFile);
          expect(packageJson.main).to.equal('dist/bar/foo.js');
        });
        it('should not create an index file because it uses the package.json main property', () => {
          const indexFile = path.join(helper.scopes.localPath, 'components', 'bar', 'foo', 'index.js');
          expect(indexFile).to.not.be.a.path();
        });
        it('should generate all the links in the dists directory and be able to require its direct dependency', () => {
          const result = helper.command.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type and got is-string and got foo');
        });
        describe('bit build all', () => {
          before(() => {
            fs.removeSync(path.join(helper.scopes.localPath, 'components', 'bar', 'foo', 'dist'));
            helper.command.build();
          });
          it('should build the imported component although it was not modified', () => {
            const result = helper.command.runCmd('node app.js');
            expect(result.trim()).to.equal('got is-type and got is-string and got foo');
          });
        });
      });
    });
    describe('re-import with a specific path', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo');
        helper.command.importComponent('bar/foo -p new-location');
        localConsumerFiles = helper.fs.getConsumerFiles();
      });
      it('should move the component directory to the new location', () => {
        const newLocation = path.join('new-location', 'bar', 'foo.js');
        const oldLocation = path.join('components', 'bar', 'foo', 'bar', 'foo.js');
        expect(localConsumerFiles).to.include(newLocation);
        expect(localConsumerFiles).not.to.include(oldLocation);
      });
      it('should update the rootDir in bit.map to the new location', () => {
        const bitMap = helper.bitMap.read();
        const componentMap = bitMap[`${helper.scopes.remote}/bar/foo@0.0.1`];
        expect(componentMap.rootDir).to.equal('new-location');
      });
      it('should be able to require its direct dependency and print results from all dependencies', () => {
        const appJsFixture = `const barFoo = require('${helper.general.getRequireBitPath('bar', 'foo')}');
console.log(barFoo.default());`;
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
      it('bit diff should not show any diff', () => {
        const outputAll = helper.general.runWithTryCatch('bit diff');
        expect(outputAll).to.have.string('no modified components');
        const outputBarFoo = helper.general.runWithTryCatch('bit diff bar/foo');
        expect(outputBarFoo).to.have.string('no diff for');
      });
    });
  });

  describe('modifying a dependent and a dependency at the same time', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fixtures.addComponentUtilsIsType();
      helper.fs.createFile('utils', 'is-string.js', fixtures.isString);
      helper.fixtures.addComponentUtilsIsString();
      helper.command.tagAllComponents();

      helper.fs.createFile('utils', 'is-type.js', fixtures.isTypeV2); // modify is-type
      helper.fs.createFile('utils', 'is-string.js', fixtures.isStringV2); // modify is-string

      helper.command.tagAllComponents();
      helper.command.exportAllComponents();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('utils/is-string');
    });
    it('the dependent should have the updated version of the dependency', () => {
      const output = helper.command.showComponentParsed('utils/is-string');
      expect(output.dependencies[0].id).to.have.string('is-type@0.0.2');
    });
    it('should use the updated dependent and dependencies and print the results from the latest versions', () => {
      const appJsFixture = "const isString = require('./components/utils/is-string'); console.log(isString());";
      fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
      const result = helper.command.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type v2 and got is-string v2');
    });
  });

  describe('to an inner directory (not consumer root)', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();

      const pathToRunImportFrom = path.join(helper.scopes.localPath, 'utils');
      fs.ensureDirSync(pathToRunImportFrom);
      helper.command.runCmd(`bit import ${helper.scopes.remote}/bar/foo`, pathToRunImportFrom);
    });
    it('should import to the consumer root directory as if the command was running from the root', () => {
      const expectedLocation = path.join(helper.scopes.localPath, 'components', 'bar', 'foo', 'foo.js');
      expect(fs.existsSync(expectedLocation)).to.be.true;
    });
  });

  describe('importing v1 of a component when a component has v2', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.reInitRemoteScope();
      helper.scopeHelper.addRemoteScope();
      helper.env.importCompiler();

      const isTypeFixtureV1 = "module.exports = function isType() { return 'got is-type v1'; };";
      helper.fs.createFile('utils', 'is-type.js', isTypeFixtureV1);
      helper.fixtures.addComponentUtilsIsType();
      helper.command.tagComponent('utils/is-type');
      helper.fs.createFile('utils', 'is-type.js', fixtures.isTypeV2); // modify is-type
      helper.command.tagComponent('utils/is-type');
      helper.command.exportAllComponents();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('utils/is-type@0.0.1');
    });
    it('should show the component as pending updates', () => {
      const statusOutput = helper.command.runCmd('bit status');
      expect(statusOutput).to.have.string('pending updates');
      expect(statusOutput).to.have.string('current: 0.0.1');
      expect(statusOutput).to.have.string('latest: 0.0.2');
    });
    describe('then importing v2', () => {
      before(() => {
        helper.command.importComponent('utils/is-type@0.0.2');
      });
      it('should imported v2 successfully and print the result from the latest version', () => {
        const appJsFixture = "const isType = require('./components/utils/is-type'); console.log(isType());";
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type v2'); // notice the "v2"
      });
      it('should update the existing record in bit.map', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.have.property(`${helper.scopes.remote}/utils/is-type@0.0.2`);
      });
      it('should not create a new record in bit.map', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.not.have.property(`${helper.scopes.remote}/utils/is-type@0.0.1`);
      });
    });
  });

  describe('after adding dependencies to an imported component with relative syntax', () => {
    let output;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const isStringWithNoDepsFixture = "module.exports = function isString() { return 'got is-string'; };";
      helper.fs.createFile('utils', 'is-string.js', isStringWithNoDepsFixture);
      helper.fixtures.addComponentUtilsIsString();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('utils/is-string');

      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fixtures.addComponentUtilsIsType();
      const isStringWithDepsFixture =
        "const isType = require('../../../utils/is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.fs.createFile('components/utils/is-string', 'is-string.js', isStringWithDepsFixture); // modify utils/is-string
      try {
        output = helper.command.tagAllComponents();
      } catch (err) {
        output = err.toString();
      }
    });
    it('should not allow tagging the component', () => {
      const RelativeCompClass = IssuesClasses.relativeComponents;
      expect(output).to.have.string('error: issues found with the following component dependencies');
      expect(output).to.have.string(`${helper.scopes.remote}/utils/is-string@0.0.1`);
      expect(output).to.have.string(new RelativeCompClass().description);
      expect(output).to.have.string('is-string.js -> utils/is-type');
    });
  });

  /**
   * requiring an imported component with relative paths may lead to bigger and bigger dependencies
   * paths. It's better to avoid them and use absolute path instead
   */
  describe('after adding another component requiring the imported component with relative syntax', () => {
    let output;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fixtures.addComponentUtilsIsType();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('utils/is-type');
      const isStringWithDepsFixture =
        "const isType = require('../components/utils/is-type/is-type'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.fs.createFile('utils', 'is-string.js', isStringWithDepsFixture);
      helper.fixtures.addComponentUtilsIsString();
      try {
        output = helper.command.tagAllComponents();
      } catch (err) {
        output = err.toString();
      }
    });
    it('should not allow tagging the component', () => {
      const RelativeCompClass = IssuesClasses.relativeComponents;
      expect(output).to.have.string(new RelativeCompClass().description);
    });
  });

  describe('import the same component ("is-type") as an indirect dependency (of "is-string") and as a direct dependency', () => {
    let localConsumerFiles;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fixtures.addComponentUtilsIsType();
      helper.fs.createFile('utils', 'is-string.js', fixtures.isString);
      helper.fixtures.addComponentUtilsIsString();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importManyComponents(['utils/is-type', 'utils/is-string']);
      localConsumerFiles = helper.fs.getConsumerFiles();
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
        helper.scopes.remote,
        '0.0.1',
        'utils',
        'is-type.js'
      );
      expect(localConsumerFiles).to.not.include(expectedLocation);
    });
    it('should successfully require is-type dependency and print the results from both components', () => {
      const appJsFixture = "const isString = require('./components/utils/is-string'); console.log(isString());";
      fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
      const result = helper.command.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string');
    });
  });

  describe('import the same component ("is-type") as an indirect dependency (of "is-string") and as a direct dependency with a newer version', () => {
    // in other words, is-type@0.0.1 is a direct dependency of is-string, and the bit.json have these two components:
    // is-string@0.0.1 and is-type@0.0.2. After the import we expect to have both is-type versions (1 and 2), and is-string to
    // work with the v1 of is-type.
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const isTypeFixtureV1 = "module.exports = function isType() { return 'got is-type v1'; };";
      helper.fs.createFile('utils', 'is-type.js', isTypeFixtureV1);
      helper.fixtures.addComponentUtilsIsType();
      helper.fs.createFile('utils', 'is-string.js', fixtures.isString);
      helper.fixtures.addComponentUtilsIsString();
      helper.command.tagAllComponents();

      helper.fs.createFile('utils', 'is-type.js', fixtures.isTypeV2); // update component
      helper.command.tagAllComponents();

      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();

      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      helper.command.importManyComponents(['utils/is-string@0.0.1', ['utils/is-type@0.0.2']]);
    });
    it('should successfully print results of is-type@0.0.1 when requiring it indirectly by is-string', () => {
      const requirePath = helper.general.getRequireBitPath('utils', 'is-string');
      const appJsFixture = `const isString = require('${requirePath}'); console.log(isString());`;
      fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
      const result = helper.command.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type v1 and got is-string');
    });
    it('should successfully print results of is-type@0.0.2 when requiring it directly', () => {
      const requirePath = helper.general.getRequireBitPath('utils', 'is-type');
      const appJsFixture = `const isType = require('${requirePath}'); console.log(isType());`;
      fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
      const result = helper.command.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type v2');
    });
  });

  describe('creating two components: "is-type" and "is-string" while "is-string" depends on "is-type"', () => {
    let scopeAfterExport;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fixtures.addComponentUtilsIsType();
      helper.fs.createFile('utils', 'is-string.js', fixtures.isString);
      helper.fixtures.addComponentUtilsIsString();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      scopeAfterExport = helper.scopeHelper.cloneLocalScope();
    });
    describe('import is-type as a dependency and then import it directly', () => {
      let localConsumerFiles;
      let localScope;
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('utils/is-string'); // imports is-type as a dependency
        helper.command.importComponent('utils/is-type');
        localConsumerFiles = helper.fs.getConsumerFiles();

        const appJsFixture = "const isString = require('./components/utils/is-string'); console.log(isString());";
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
        localScope = helper.scopeHelper.cloneLocalScope();
      });
      it('should rewrite is-type directly into "components" directory', () => {
        const expectedLocation = path.join('components', 'utils', 'is-type', 'is-type.js');
        expect(localConsumerFiles).to.include(expectedLocation);
      });
      it('should update the existing record of is-type in bit.map from NESTED to IMPORTED', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.have.property(`${helper.scopes.remote}/utils/is-type@0.0.1`);
        expect(bitMap[`${helper.scopes.remote}/utils/is-type@0.0.1`].origin).to.equal('IMPORTED');
      });
      it('should not show any component in bit status', () => {
        const output = helper.command.runCmd('bit status');
        expect(output).to.not.have.string('utils/is-string');
        expect(output).to.not.have.string('utils/is-type');
        helper.command.expectStatusToBeClean();
      });
      it('should not break the is-string component', () => {
        helper.fs.createFile(path.join('components', 'utils', 'is-type'), 'is-type.js', fixtures.isTypeV2);

        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type v2 and got is-string');
      });
      describe('moving is-type', () => {
        before(() => {
          helper.command.move('components/utils/is-type', 'another-dir');
        });
        it('should not break is-string component', () => {
          const result = helper.command.runCmd('node app.js');
          expect(result.trim()).to.have.string('got is-string');
        });
      });
      describe('removing is-string', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScope);
          helper.command.removeComponent(`${helper.scopes.remote}/utils/is-string`, '-f -d');
        });
        it('should not delete is-type from the filesystem', () => {
          localConsumerFiles = helper.fs.getConsumerFiles();
          const expectedLocation = path.join('components', 'utils', 'is-type', 'is-type.js');
          expect(localConsumerFiles).to.include(expectedLocation);
        });
        it('should not delete is-type from bitMap', () => {
          const bitMap = helper.bitMap.read();
          expect(bitMap).to.have.property(`${helper.scopes.remote}/utils/is-type@0.0.1`);
        });
      });
    });
    describe('import is-type directly and then as a dependency', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('utils/is-type');
        helper.command.importComponent('utils/is-string'); // imports is-type as a dependency
      });
      it('should keep the existing record of is-type in bit.map as IMPORTED', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.have.property(`${helper.scopes.remote}/utils/is-type@0.0.1`);
        expect(bitMap[`${helper.scopes.remote}/utils/is-type@0.0.1`].origin).to.equal('IMPORTED');
      });
      it('changes of is-type in components directory should affect is-string', () => {
        helper.fs.createFile(path.join('components', 'utils', 'is-type'), 'is-type.js', fixtures.isTypeV2);

        const appJsFixture = "const isString = require('./components/utils/is-string'); console.log(isString());";
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type v2 and got is-string');
      });
    });
    describe('import is-type directly, changing it then import it as a dependency', () => {
      let output;
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('utils/is-type');
        helper.fs.createFile('components/utils/is-type', 'is-type.js', fixtures.isTypeV2);
        output = helper.general.runWithTryCatch(`bit import ${helper.scopes.remote}/utils/is-string`); // imports is-type as a dependency
      });
      it('should throw an error saying is-type is modified, suggesting to override or merge', () => {
        expect(output).to.have.string('unable to import');
        expect(output).to.have.string('--override');
        expect(output).to.have.string('--merge');
      });
    });
    describe('import is-type as a dependency and then import it directly with a newer version', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeAfterExport);
        helper.fs.createFile('utils', 'is-type.js', fixtures.isTypeV2);
        helper.fs.createFile('utils', 'is-string.js', fixtures.isStringV2);
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();

        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('utils/is-string@0.0.1'); // imports is-type@0.0.1 as a dependency
        helper.command.importComponent('utils/is-type@0.0.2');
      });
      it('should show the component as modified', () => {
        const output = helper.command.runCmd('bit status');
        expect(output).to.have.string('modified');
      });
      it('bit diff should show that the modification is about version bump of is-type', () => {
        const diff = helper.command.diff();
        expect(diff).to.have.string(`- ${helper.scopes.remote}/utils/is-type@0.0.1`);
        expect(diff).to.have.string(`+ ${helper.scopes.remote}/utils/is-type@0.0.2`);
      });
      it('should use the new version of is-type', () => {
        const appJsFixture = "const isString = require('./components/utils/is-string'); console.log(isString());";
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type v2 and got is-string');
      });
    });
  });

  describe('import component with dependencies from scope A, modify and export them to scope B, then import to a new local scope', () => {
    let scopeB;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fixtures.addComponentUtilsIsType();
      helper.fs.createFile('utils', 'is-string.js', fixtures.isString);
      helper.fixtures.addComponentUtilsIsString();
      helper.command.tagAllComponents();
      // export to scope A
      helper.command.exportAllComponents();
      // import to a new local scope
      helper.scopeHelper.initNewLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('utils/is-string');
      // modify the component
      const componentPath = path.join('components', 'utils', 'is-string');
      helper.fs.createFile(componentPath, 'is-string.js', fixtures.isStringV2);
      helper.command.tagComponent('utils/is-string');
      // export to scope B
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      scopeB = scopeName;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.command.exportComponent(`${helper.scopes.remote}/utils/is-string@0.0.2`, scopeB, true, '--force');
      // import to a new local scope
      helper.scopeHelper.initNewLocalScope();
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.command.runCmd(`bit import ${scopeB}/utils/is-string`);
    });
    it('should export the component successfully to scope B', () => {
      const output = helper.command.runCmd(`bit list ${scopeB}`);
      expect(output.includes('found 1 components')).to.be.true;
      expect(output.includes('utils/is-string')).to.be.true;
    });
    it('should import the component successfully from scope B to a new local scope', () => {
      const appJsFixture = "const isString = require('./components/utils/is-string'); console.log(isString());";
      fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
      const result = helper.command.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string v2');
    });
  });

  describe('import component with dependencies, modify and export, then author import the updated version', () => {
    let localConsumerFiles;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fixtures.addComponentUtilsIsType();
      helper.fs.createFile('utils', 'is-string.js', fixtures.isString);
      helper.fixtures.addComponentUtilsIsString();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      const authorScope = helper.scopes.local;

      helper.scopeHelper.initNewLocalScope(false);
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('utils/is-string');
      // modify the component
      const componentPath = path.join('components', 'utils', 'is-string');
      helper.fs.createFile(componentPath, 'is-string.js', fixtures.isStringV2);
      helper.command.tagComponent('utils/is-string');
      helper.command.exportComponent(`${helper.scopes.remote}/utils/is-string@0.0.2`);

      fs.removeSync(helper.scopes.localPath);
      helper.scopes.setLocalScope(authorScope);
      helper.command.importComponent('utils/is-string');
      localConsumerFiles = glob
        .sync(path.normalize('**/*.js'), { cwd: helper.scopes.localPath })
        .map((x) => path.normalize(x));
    });
    it('should update the author original component successfully', () => {
      const appJsFixture = "const isString = require('./utils/is-string'); console.log(isString());";
      fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
      const result = helper.command.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string v2');
    });
    it('should not write any file into components directory', () => {
      localConsumerFiles.forEach((fileName) => {
        expect(fileName.startsWith('components')).to.be.false;
      });
    });
  });

  describe('import a component when the local version is modified', () => {
    let localScope;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');
      const barFooFixtureV2 = "module.exports = function foo() { return 'got foo v2'; };";
      helper.fs.createFile(path.join('components', 'bar', 'foo'), 'foo.js', barFooFixtureV2);

      const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo());";
      fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
      localScope = helper.scopeHelper.cloneLocalScope();
    });
    describe('without --override flag', () => {
      let output;
      before(() => {
        try {
          helper.command.importComponent('bar/foo');
        } catch (err) {
          output = err.toString();
        }
      });
      it('should display a warning saying it was unable to import', () => {
        expect(output).to.have.string('unable to import');
      });
      it('should not override the local changes', () => {
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got foo v2');
      });
    });
    describe('with --override flag', () => {
      let output;
      before(() => {
        output = helper.command.importComponent('bar/foo --override');
      });
      it('should display a successful message', () => {
        expect(output).to.have.string('successfully imported');
      });
      it('should override the local changes', () => {
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got foo');
      });
    });
    describe('with --merge=manual', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        output = helper.command.importComponent('bar/foo --merge=manual');
      });
      it('should display a successful message', () => {
        expect(output).to.have.string('successfully imported');
      });
      it('should not override the local changes', () => {
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got foo v2');
      });
    });
    describe('re-import a component after tagging the component', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.command.tagAllComponents();
      });
      it('should import successfully', () => {
        const output = helper.command.importComponent('bar/foo');
        expect(output).to.have.string('successfully imported');
      });
    });
  });

  describe('component with shared directory (originallySharedDir) across files and dependencies', () => {
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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile(path.join('src', 'utils'), 'is-type.js', fixtures.isType);
      helper.command.addComponent('src/utils/is-type.js', { i: 'utils/is-type' });
      helper.fs.createFile(path.join('src', 'utils'), 'is-string.js', fixtures.isString);
      helper.command.addComponent('src/utils/is-string.js', { i: 'utils/is-string' });
      helper.fixtures.createComponentBarFoo(fixtures.barFooFixture);
      helper.fs.createFile(path.join('src', 'bar'), 'foo.js', fixtures.barFooFixture);
      helper.command.addComponent('src/bar/foo.js', { i: 'bar/foo' });
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      clonedScope = helper.scopeHelper.cloneLocalScope();
      helper.command.importComponent('bar/foo');
      localConsumerFiles = helper.fs.getConsumerFiles('*.{js,json}');
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
      fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
      const result = helper.command.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
    it('should not show any of the components as new or modified or deleted or staged', () => {
      helper.command.expectStatusToBeClean();
    });
    describe('when cloning the project to somewhere else', () => {
      before(() => {
        helper.git.mimicGitCloneLocalProject(false);
        helper.scopeHelper.addRemoteScope();
        helper.command.runCmd('bit import --merge');
      });
      it('should be able to require its direct dependency and print results from all dependencies', () => {
        const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo());";
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
    });
    describe('re-import with a specific path', () => {
      describe('from consumer root', () => {
        before(() => {
          helper.command.importComponent('bar/foo -p new-location');
          localConsumerFiles = helper.fs.getConsumerFiles();
        });
        it('should move the component directory to the new location', () => {
          const newLocation = path.join('new-location', 'bar', 'foo.js');
          const oldLocation = path.join('components', 'bar', 'foo', 'bar', 'foo.js');
          expect(localConsumerFiles).to.include(newLocation);
          expect(localConsumerFiles).not.to.include(oldLocation);
        });
        it('should be able to require its direct dependency and print results from all dependencies', () => {
          const appJsFixture = "const barFoo = require('./new-location'); console.log(barFoo());";
          fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
          const result = helper.command.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type and got is-string and got foo');
        });
      });
      describe('from an inner directory', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(clonedScope);
          helper.command.importComponent('bar/foo');
          helper.command.runCmd(
            `bit import ${helper.scopes.remote}/bar/foo -p new-location`,
            path.join(helper.scopes.localPath, 'components')
          );
          localConsumerFiles = helper.fs.getConsumerFiles();
        });
        it('should move the component directory to the new location', () => {
          const newLocation = path.join('components', 'new-location', 'bar', 'foo.js');
          const oldLocation = path.join('components', 'bar', 'foo', 'bar', 'foo.js');
          expect(localConsumerFiles).to.include(newLocation);
          expect(localConsumerFiles).not.to.include(oldLocation);
        });
        it('should be able to require its direct dependency and print results from all dependencies', () => {
          const appJsFixture = "const barFoo = require('./components/new-location'); console.log(barFoo());";
          fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
          const result = helper.command.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type and got is-string and got foo');
        });
      });
    });
    describe('import a component and then its dependency directly', () => {
      // this covers several bugs found when there is originallySharedDir, a component is imported
      // and after that its dependency is imported directly.
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(clonedScope);
        helper.command.importComponent('bar/foo');
        output = helper.command.importComponent('utils/is-string');
      });
      it('should import the dependency successfully', () => {
        expect(output).to.have.string('successfully imported one component');
      });
      it('bit status should show a clean state', () => {
        helper.command.expectStatusToBeClean();
      });
    });
  });
  describe('import component with dependencies with yarn workspaces', () => {
    let dependencies;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      dependencies = path.join(
        helper.scopes.localPath,
        'components',
        '.dependencies',
        'global',
        'simple',
        helper.scopes.remote,
        '0.0.1'
      );
      helper.npm.addNpmPackage('lodash.isboolean', '3.0.0');
      const simpleFixture = 'import a from "lodash.isboolean"; ';
      helper.fs.createFile('global', 'simple.js', simpleFixture);
      helper.command.addComponent('global/simple.js', { i: 'global/simple' });
      helper.command.tagComponent('global/simple');
      helper.command.exportComponent('global/simple');
      helper.npm.addNpmPackage('lodash.isstring', '4.0.0');
      const withDepsFixture = 'import a from "./global/simple.js"; import c from "lodash.isstring"';
      helper.fs.createFile('', 'with-deps.js', withDepsFixture);
      helper.command.addComponent('with-deps.js', { i: 'comp/with-deps' });
      helper.command.tagAllComponents();
      helper.command.exportComponent('comp/with-deps');
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
      helper.bitJson.manageWorkspaces();
      helper.command.importComponent('comp/with-deps');
      helper.packageJson.addKeyValue({ customField: 'bit is awsome' });
    });
    it('should install component dependencies as separate packages with yarn workspaces', () => {
      expect(dependencies).to.be.a.directory('should not be empty').and.not.empty;
    });
    it('Should contain yarn lock file', () => {
      expect(path.join(helper.scopes.localPath, 'yarn.lock')).to.be.a.file('no yarn lock file');
    });
    it('should install global/simple package dependencies with yarn', () => {
      expect(path.join(helper.scopes.localPath, 'node_modules')).to.be.a.directory('should not be empty').and.not.empty;
      expect(path.join(helper.scopes.localPath, 'node_modules', 'lodash.isboolean')).to.be.a.directory(
        'should contain lodash.isboolean'
      ).and.not.empty;
    });
    it('should contain workspaces array in package.json and private true', () => {
      const pkgJson = helper.packageJson.read(helper.scopes.localPath);
      expect(pkgJson.workspaces).to.have.members(['components/.dependencies/**/*', 'components/{name}/**/*']);
      expect(pkgJson.private).to.be.true;
    });
    it('component dep should be install as npm package', () => {
      const modulePath = path.join(
        helper.scopes.localPath,
        'node_modules',
        '@bit',
        `${helper.scopes.remote}.global.simple`
      );
      expect(modulePath).to.be.a.directory('should contain component dep as npm package dep').and.not.empty;
    });
    it('Should not contain duplicate regex in workspaces dir if we run import again ', () => {
      helper.command.importComponent('comp/with-deps --override');
      const pkgJson = helper.packageJson.read(helper.scopes.localPath);
      expect(pkgJson.workspaces).to.have.members(['components/.dependencies/**/*', 'components/{name}/**/*']);
      expect(pkgJson.workspaces).to.be.ofSize(2);
      expect(path.join(helper.scopes.localPath, 'yarn.lock')).to.be.a.file('no yarn lock file');
    });
    it('Should not delete custom fields in package.json', () => {
      helper.command.importComponent('comp/with-deps --override');
      const pkgJson = helper.packageJson.read();
      expect(pkgJson).to.have.property('customField');
      expect(pkgJson.customField).to.equal('bit is awsome');
    });
    it('Should not delete delete workspaces that already existed in package.json', () => {
      helper.packageJson.addKeyValue({ workspaces: ['comp'] });
      helper.command.importComponent('comp/with-deps --override');
      const pkgJson = helper.packageJson.read();
      expect(pkgJson.workspaces).to.have.members(['comp', 'components/.dependencies/**/*', 'components/{name}/**/*']);
    });
    it('Should save workspaces with custom import path ', () => {
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath);
      helper.bitJson.manageWorkspaces();
      helper.command.importComponent('comp/with-deps -p test');
      const pkgJson = helper.packageJson.read();
      expect(pkgJson.workspaces).to.have.members(['components/.dependencies/**/*', 'components/{name}/**/*', 'test']);
    });
    // @see https://github.com/teambit/bit/issues/2079
    describe('when Yarn workspaces is an object and not an array', () => {
      before(() => {
        const packageJson = helper.packageJson.read();
        packageJson.workspaces = {
          packages: [],
          nohoist: [],
        };
        helper.packageJson.write(packageJson);
        helper.command.importComponent('comp/with-deps');
      });
      it('should save the same workspaces info and preserve the workspaces structure', () => {
        const pkgJson = helper.packageJson.read();
        expect(pkgJson.workspaces).to.have.property('packages');
        expect(pkgJson.workspaces).to.have.property('nohoist');
        expect(pkgJson.workspaces.packages).to.include('components/.dependencies/**/*', 'components/**/*');
        expect(pkgJson.private).to.be.true;
      });
    });
  });
  describe('importing a component when it has a local tag', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
    });
    describe('as author', () => {
      before(() => {
        helper.fixtures.createComponentBarFoo('v2');
        const tagOutput = helper.command.tagAllComponents();
        expect(tagOutput).to.have.string('0.0.2');

        // at this stage, the remote component has only 0.0.1. The local component has also 0.0.2
        helper.command.importComponent('bar/foo');
      });
      it('should not remove the local version', () => {
        const catComponent = helper.command.catComponent('bar/foo');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(catComponent.versions).to.have.property('0.0.1');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(catComponent.versions).to.have.property('0.0.2');
      });
      it('should not override the local component', () => {
        const catComponent = helper.command.catComponent('bar/foo');
        expect(catComponent).to.have.property('state');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(catComponent.state).to.have.property('versions');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(catComponent.state.versions).to.have.property('0.0.2');
      });
    });
    describe('as imported', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo');
        helper.fs.createFile('components/bar/foo', 'foo.js', 'v2');
        const tagOutput = helper.command.tagAllComponents();
        expect(tagOutput).to.have.string('0.0.2');

        // at this stage, the remote component has only 0.0.1. The local component has also 0.0.2
        helper.command.importComponent('bar/foo');
      });
      it('should not remove the local version', () => {
        const catComponent = helper.command.catComponent(`${helper.scopes.remote}/bar/foo`);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(catComponent.versions).to.have.property('0.0.1');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(catComponent.versions).to.have.property('0.0.2');
      });
      it('should not override the local component', () => {
        const catComponent = helper.command.catComponent(`${helper.scopes.remote}/bar/foo`);
        expect(catComponent).to.have.property('state');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(catComponent.state).to.have.property('versions');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(catComponent.state.versions).to.have.property('0.0.2');
      });
      describe('importing a specific version', () => {
        let output;
        before(() => {
          output = helper.command.importComponent('bar/foo@0.0.1');
        });
        it('should not throw an error saying the component was not found', () => {
          expect(output).to.have.string('successfully imported');
        });
      });
    });
  });
  describe('importing a component when its dependency is authored', () => {
    let output;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fs.createFile('utils', 'is-string.js', fixtures.isString);
      helper.fixtures.addComponentUtilsIsType();
      helper.fixtures.addComponentUtilsIsString();
      helper.command.tagAllComponents();
      const exportOutput = helper.command.exportAllComponents();

      // intermediate step to make sure all are exported
      expect(exportOutput).to.have.string('exported 2 components');

      const removeOutput = helper.command.removeComponent('utils/is-string', '--delete-files');
      expect(removeOutput).to.have.string('successfully removed');

      output = helper.command.importComponent('utils/is-string');
    });
    it('should not throw an error when importing', () => {
      expect(output).to.have.string('successfully imported one component');
    });
    it('should generate the links to the authored component successfully', () => {
      const run = () => helper.command.runCmd(`node ${path.normalize('components/utils/is-string/is-string.js')}`);
      expect(run).not.to.throw();
    });
  });
  describe('adding a scoped package to an imported component', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');
      helper.fs.createFile('components/bar/foo', 'foo.js', 'require("@babel/core");');
      helper.npm.addNpmPackage('@babel/core');
    });
    it('bit show should include the new package', () => {
      const show = helper.command.showComponentParsed('bar/foo');
      expect(show.packageDependencies).to.have.property('@babel/core');
    });
  });
  describe('import compiler with a non-exist version', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
    });
    it('should throw an error that a component does not exist', () => {
      helper.env.importCompiler(); // makes sure the component exists. (only not the same version)
      const compiler = `${helper.scopes.env}/compilers/babel@1000.0.1`;
      const error = new ComponentNotFound(compiler);
      const importCmd = () => helper.env.importCompiler(compiler);
      helper.general.expectToThrow(importCmd, error);
    });
  });
  describe('import component with invalid bit.json paths properties', () => {
    describe('when componentsDefaultDirectory is invalid', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        const bitJson = helper.bitJson.read();
        bitJson.componentsDefaultDirectory = '/components/{name}';
        helper.bitJson.write(bitJson);
      });
      it('should throw a descriptive error pointing to the bit.json property', () => {
        const importCmd = () => helper.command.importComponent('any-comp');
        const error = new InvalidConfigPropPath('componentsDefaultDirectory', '/components/{name}');
        helper.general.expectToThrow(importCmd, error);
      });
    });
    describe('when dependenciesDirectory is invalid', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        const bitJson = helper.bitJson.read();
        bitJson.dependenciesDirectory = '/components/.dependencies';
        helper.bitJson.write(bitJson);
      });
      it('should throw a descriptive error pointing to the bit.json property', () => {
        const importCmd = () => helper.command.importComponent('any-comp');
        const error = new InvalidConfigPropPath('dependenciesDirectory', '/components/.dependencies');
        helper.general.expectToThrow(importCmd, error);
      });
    });
  });
  describe('when one file is a prefix of the other', () => {
    let output;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('bar', 'foo.js');
      helper.fs.createFile('bar', 'foo.json');
      helper.command.addComponent('bar/foo.js bar/foo.json', { m: 'bar/foo.js', i: 'bar/foo' });
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      output = helper.command.importComponent('bar/foo');
    });
    it('should import with no error', () => {
      expect(output).to.have.string('successfully');
    });
  });
  describe('import with wildcards', () => {
    let scopeBeforeImport;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fs.createFile('utils', 'is-string.js');
      helper.fs.createFile('utils', 'is-type.js');
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.addComponentUtilsIsString();
      helper.fixtures.addComponentUtilsIsType();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      scopeBeforeImport = helper.scopeHelper.cloneLocalScope();
    });
    describe('import the entire scope', () => {
      let output;
      before(() => {
        output = helper.command.importComponent('*');
      });
      it('should import all components from the remote scope', () => {
        expect(output).to.have.string('bar/foo');
        expect(output).to.have.string('utils/is-string');
        expect(output).to.have.string('utils/is-type');
      });
      it('bit ls should show that all components from the remote scope were imported', () => {
        const ls = helper.command.listLocalScopeParsed();
        expect(ls).to.be.lengthOf(3);
      });
    });
    describe('import only bar/* namespace', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeBeforeImport);
        output = helper.command.importComponent('bar/*');
      });
      it('should import only bar/foo but not any component from utils namespace', () => {
        expect(output).to.have.string('bar/foo');
        expect(output).to.not.have.string('utils');
      });
      it('bit ls should show that only bar/foo has imported', () => {
        const ls = helper.command.listLocalScopeParsed();
        expect(ls).to.be.lengthOf(1);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(ls[0].id).to.equal(`${helper.scopes.remote}/bar/foo`);
      });
    });
    describe('import only utils/* namespace', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeBeforeImport);
        output = helper.command.importComponent('utils/*');
      });
      it('should import only utils components but not any component from bar namespace', () => {
        expect(output).to.not.have.string('bar/foo');
        expect(output).to.have.string('utils/is-string');
        expect(output).to.have.string('utils/is-type');
      });
      it('bit ls should show that only bar/foo has imported', () => {
        const ls = helper.command.listLocalScopeParsed();
        expect(ls).to.be.lengthOf(2);
      });
    });
  });
  describe('import with --dependencies and --dependents flags', () => {
    let scopeBeforeImport;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithThreeComponents();
      helper.fs.createFile('utils', 'bar-dep.js');
      helper.fs.createFile('bar', 'foo2.js', 'require("../utils/bar-dep");');
      helper.command.addComponent('utils/bar-dep.js');
      helper.command.addComponent('bar/foo2.js', { i: 'bar/foo2' });
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      scopeBeforeImport = helper.scopeHelper.cloneLocalScope();
    });
    describe('import with --dependencies flag', () => {
      before(() => {
        helper.command.importComponent('bar/* --dependencies');
      });
      it('should import directly (not nested) all dependencies', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap)
          .to.have.property(`${helper.scopes.remote}/utils/is-string@0.0.1`)
          .that.has.property('origin')
          .equal('IMPORTED');
        expect(bitMap)
          .to.have.property(`${helper.scopes.remote}/utils/is-type@0.0.1`)
          .that.has.property('origin')
          .equal('IMPORTED');
        expect(bitMap)
          .to.have.property(`${helper.scopes.remote}/bar-dep@0.0.1`)
          .that.has.property('origin')
          .equal('IMPORTED');
      });
    });
    describe('import with --dependents flag', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeBeforeImport);
        output = helper.command.importComponent('utils/is-type --dependents');
      });
      it('should import all dependents', () => {
        expect(output).to.have.string('successfully imported 3 components');
        expect(output).to.have.string(`${helper.scopes.remote}/utils/is-string`);
        expect(output).to.have.string(`${helper.scopes.remote}/bar/foo`);
      });
      it('bit list should show them all', () => {
        const list = helper.command.listLocalScope();
        expect(list).to.have.string(`${helper.scopes.remote}/utils/is-type`);
        expect(list).to.have.string(`${helper.scopes.remote}/utils/is-string`);
        expect(list).to.have.string(`${helper.scopes.remote}/bar/foo`);
      });
    });
  });
  // is-type has bar/foo@0.0.1 as an indirect dependent and bar/foo@0.0.1 as a direct dependent
  describe('component with different versions of the same dependent', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithThreeComponents();
      helper.command.tagAllComponents();
      helper.fixtures.createComponentBarFoo("require('../utils/is-type.js')");
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
    });
    it('bit show of the remote scope should show both versions of the dependent', () => {
      const show = helper.command.showComponentParsed(`${helper.scopes.remote}/utils/is-type --remote --dependents`);
      expect(show.dependentsInfo).to.have.lengthOf(3);
      const barFooV1 = show.dependentsInfo.find((d) => d.id.name === 'bar/foo' && d.id.version === '0.0.1');
      const barFooV2 = show.dependentsInfo.find((d) => d.id.name === 'bar/foo' && d.id.version === '0.0.2');
      expect(barFooV1).to.not.be.undefined;
      expect(barFooV2).to.not.be.undefined;
      expect(barFooV1).to.have.property('depth').that.equals(2);
      expect(barFooV2).to.have.property('depth').that.equals(1);
    });
    describe('import the component with "--dependents" flag', () => {
      before(() => {
        helper.command.importComponent('utils/is-type --dependents');
      });
      it('should import the dependent only once and with the highest version', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.have.property(`${helper.scopes.remote}/bar/foo@0.0.2`);
        expect(bitMap).to.not.have.property(`${helper.scopes.remote}/bar/foo@0.0.1`);
      });
      it('bit show of the local scope show both versions of the dependent', () => {
        const show = helper.command.showComponentParsed(`${helper.scopes.remote}/utils/is-type --dependents`);
        expect(show.dependentsInfo).to.have.lengthOf(3);
        const barFooV1 = show.dependentsInfo.find((d) => d.id.name === 'bar/foo' && d.id.version === '0.0.1');
        const barFooV2 = show.dependentsInfo.find((d) => d.id.name === 'bar/foo' && d.id.version === '0.0.2');
        expect(barFooV1).to.not.be.undefined;
        expect(barFooV2).to.not.be.undefined;
        expect(barFooV1).to.have.property('depth').that.equals(2);
        expect(barFooV2).to.have.property('depth').that.equals(1);
      });
    });
  });
});
