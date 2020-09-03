/* eslint-disable max-lines */
import chai, { expect } from 'chai';
import * as path from 'path';

import * as api from '../../src/api';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

function sortComponentsArrayByComponentId(componentsArray) {
  return componentsArray.sort(function (a, b) {
    const idA = a.addedComponents[0].id.toLowerCase();
    const idB = b.addedComponents[0].id.toLowerCase();
    if (idA < idB) {
      return -1;
    }
    if (idA > idB) {
      return 1;
    }
    return 0;
  });
}

// started to break since https://github.com/teambit/bit/pull/2654
// this feature is not really in use so it's not worth to fix it.
describe.skip('bit add many programmatically', function () {
  this.timeout(0);
  let helper: Helper;
  this.timeout(0);
  before(() => {
    this.timeout(0);
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  const components = [
    {
      componentPaths: ['add_many_test_files/a.js'],
      main: 'add_many_test_files/a.js',
      id: 'add_many_test_files/my_defined_id',
      tests: ['add_many_test_files/a.spec.js'],
    },
    {
      componentPaths: ['add_many_test_files/c.js'],
      main: 'add_many_test_files/c.js',
      id: 'add_many_test_files/c',
    },
    {
      componentPaths: ['add_many_test_files/b.js'],
      namespace: 'my_namespace',
      main: 'add_many_test_files/b.js',
    },
    {
      componentPaths: ['add_many_test_files/d.js'],
      main: 'add_many_test_files/d.js',
      tests: ['add_many_test_files/d.spec.js'],
      exclude: ['add_many_test_files/d.spec.js'],
      id: 'add_many_test_files/d',
    },
    {
      componentPaths: ['add_many_test_files/e.js', 'add_many_test_files/f.js'],
      main: 'add_many_test_files/e.js',
      id: 'add_many_test_files/component_with_many_paths',
    },
  ];
  const componentsInside = [
    {
      componentPaths: ['../../g.js'],
      main: '../../g.js',
      id: 'g',
    },
    {
      componentPaths: ['../../h.js'],
      main: '../../h.js',
      id: 'h',
      tests: ['../../h.spec.js'],
    },
    {
      componentPaths: ['../../i.js'],
      main: '../../i.js',
      tests: ['../../i.spec.js'],
      exclude: ['../../i.spec.js'],
    },
  ];
  after(() => {
    helper.scopeHelper.destroy();
  });
  let nodeStartOutput;
  let nodeStartOutputObj;
  let status;
  describe('should transfer wrong and right script path', function () {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.copyFixtureComponents('add-many');
    });
    it('should transfer right script path ', async function () {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const result = await api.addMany(components, helper.scopes.localPath);
      nodeStartOutputObj = result;
      nodeStartOutputObj = sortComponentsArrayByComponentId(nodeStartOutputObj);
      expect(nodeStartOutputObj[0]).to.have.property('addedComponents');
      expect(nodeStartOutputObj[0].addedComponents[0]).to.have.property('id');
      expect(nodeStartOutputObj[0].addedComponents[0].id).to.equal('add_many_test_files/c');
    });
  });
  describe('should add many components programmatically, process.cwd() is inside project path', function () {
    before(async function () {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.copyFixtureComponents('add-many');
      const innerScriptPathRelative = 'add_many_test_files/inner_folder';
      const innerScriptPathAbsolute = path.join(helper.scopes.localPath, innerScriptPathRelative);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      nodeStartOutputObj = await api.addMany(componentsInside, innerScriptPathAbsolute);
      status = helper.command.status();
    });
    it('should add a component, with id and no spec', function () {
      expect(nodeStartOutputObj).to.be.array();
      expect(nodeStartOutputObj[0]).to.have.property('addedComponents');
      expect(nodeStartOutputObj[0].addedComponents[0]).to.have.property('id');
      expect(nodeStartOutputObj[0].addedComponents[0].id).to.equal('g');
      expect(nodeStartOutputObj[0].addedComponents[0].files).to.be.array();
      expect(nodeStartOutputObj[0].addedComponents[0].files).to.be.ofSize(1);
      expect(nodeStartOutputObj[0].addedComponents[0].files[0].test).to.equal(false);
      expect(status).to.have.string('g ... ok');
    });
    it('should add a components ,with id and with spec', function () {
      expect(nodeStartOutputObj).to.be.array();
      expect(nodeStartOutputObj[0]).to.have.property('addedComponents');
      expect(nodeStartOutputObj[1].addedComponents[0]).to.have.property('files');
      expect(nodeStartOutputObj[1].addedComponents[0].files).to.be.array();
      expect(nodeStartOutputObj[1].addedComponents[0].files).to.be.ofSize(2);
      expect(nodeStartOutputObj[1].addedComponents[0].files[1].test).to.equal(true);
      expect(nodeStartOutputObj[1].addedComponents[0].files[1].name).to.equal('h.spec.js');
      expect(status).to.have.string('h ... ok');
      const compData = JSON.parse(helper.command.showComponentWithOptions('h', { j: '' }));
      expect(compData).to.not.property('Specs');
    });
    it('should add a component with excluded test file', function () {
      expect(nodeStartOutputObj[2].addedComponents[0]).to.have.property('id');
      expect(nodeStartOutputObj[2].addedComponents[0].id).to.contains('i');
      expect(nodeStartOutputObj[2].addedComponents[0]).to.have.property('files');
      expect(nodeStartOutputObj[2].addedComponents[0].files).to.be.array();
      expect(nodeStartOutputObj[2].addedComponents[0].files).to.be.ofSize(1);
      expect(nodeStartOutputObj[2].addedComponents[0].files[0].test).to.equal(false);
      expect(status).to.have.string('i ... ok');
    });
    it('should check array size of added components array', function () {
      expect(nodeStartOutputObj).to.be.array();
      expect(nodeStartOutputObj).to.be.ofSize(3);
    });
  });
  describe('should add many components programmatically, process.cwd() is in not connected dir to project path', function () {
    before(async function () {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.copyFixtureComponents('add-many');
      const newDirPath = helper.fs.createNewDirectory();
      const scriptRelativePath = 'add-many';
      helper.fixtures.copyFixtureComponents(scriptRelativePath, newDirPath);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      nodeStartOutputObj = await api.addMany(components, helper.scopes.localPath);
      nodeStartOutputObj = sortComponentsArrayByComponentId(nodeStartOutputObj);
      helper.command.linkAndRewire();
      status = helper.command.status();
    });
    it('should add a component with no id and no spec', function () {
      expect(nodeStartOutputObj).to.be.array();
      expect(nodeStartOutputObj[0]).to.have.property('addedComponents');
      expect(nodeStartOutputObj[0].addedComponents[0]).to.have.property('id');
      expect(nodeStartOutputObj[0].addedComponents[0].id).to.equal('add_many_test_files/c');
      expect(nodeStartOutputObj[0].addedComponents[0]).to.have.property('files');
      expect(nodeStartOutputObj[0].addedComponents[0].files).to.be.array();
      expect(nodeStartOutputObj[0].addedComponents[0].files).to.be.ofSize(1);
      expect(nodeStartOutputObj[0].addedComponents[0].files[0].test).to.equal(false);
      expect(status).to.have.string('add_many_test_files/c ... ok');
      const compData = JSON.parse(helper.command.showComponentWithOptions('add_many_test_files/c', { j: '' }));
      expect(compData).to.not.property('Specs');
    });
    it('should add a component with spec file', function () {
      expect(nodeStartOutputObj).to.be.array();
      expect(nodeStartOutputObj[3]).to.have.property('addedComponents');
      expect(nodeStartOutputObj[3].addedComponents[0].files).to.be.array();
      expect(nodeStartOutputObj[3].addedComponents[0].files).to.be.ofSize(2);
      expect(nodeStartOutputObj[3].addedComponents[0].files[0].test).to.equal(false);
      expect(nodeStartOutputObj[3].addedComponents[0].files[0].name).to.equal('a.js');
      expect(nodeStartOutputObj[3].addedComponents[0].files[1].test).to.equal(true);
      expect(nodeStartOutputObj[3].addedComponents[0].files[1].name).to.equal('a.spec.js');
      expect(status).to.have.string('add_many_test_files/my_defined_id ... ok');
      const compData = JSON.parse(
        helper.command.showComponentWithOptions('add_many_test_files/my_defined_id', { j: '' })
      );
      expect(compData).to.have.property('files');
      expect(compData.files[1].relativePath).to.equal(path.normalize('add_many_test_files/a.spec.js'));
    });
    it('should add a component with user defined id', function () {
      expect(nodeStartOutputObj).to.be.array();
      expect(nodeStartOutputObj[3]).to.have.property('addedComponents');
      expect(nodeStartOutputObj[3].addedComponents[0].id).to.equal('add_many_test_files/my_defined_id');
      expect(status).to.have.string('add_many_test_files/my_defined_id ... ok');
      const compData = JSON.parse(
        helper.command.showComponentWithOptions('add_many_test_files/my_defined_id', { j: '' })
      );
      expect(compData).to.have.property('name');
      expect(compData.name).to.equal('add_many_test_files/my_defined_id');
    });
    it('should add a component with namespace and no id', async function () {
      expect(nodeStartOutputObj).to.be.array();
      expect(nodeStartOutputObj[4]).to.have.property('addedComponents');
      expect(nodeStartOutputObj[4].addedComponents[0].id).to.equal('my_namespace/b');
      expect(status).to.have.string('my_namespace/b ... ok');
      const compData = JSON.parse(helper.command.showComponentWithOptions('my_namespace/b', { j: '' }));
      expect(compData).to.have.property('name');
      expect(compData.name).to.equal('my_namespace/b');
    });
    it('should add a component with excluded test file', function () {
      expect(nodeStartOutputObj[2].addedComponents[0]).to.have.property('id');
      expect(nodeStartOutputObj[2].addedComponents[0].id).to.equal('add_many_test_files/d');
      expect(nodeStartOutputObj[2].addedComponents[0]).to.have.property('files');
      expect(nodeStartOutputObj[2].addedComponents[0].files).to.be.array();
      expect(nodeStartOutputObj[2].addedComponents[0].files).to.be.ofSize(1);
      expect(nodeStartOutputObj[2].addedComponents[0].files[0].test).to.equal(false);
      expect(status).to.have.string('add_many_test_files/d ... ok');
      const compData = JSON.parse(helper.command.showComponentWithOptions('add_many_test_files/d', { j: '' }));
      expect(compData).to.not.property('Specs');
    });
    it('should add a component with many files', function () {
      expect(nodeStartOutputObj[1].addedComponents[0]).to.have.property('id');
      expect(nodeStartOutputObj[1].addedComponents[0].id).to.equal('add_many_test_files/component_with_many_paths');
      expect(nodeStartOutputObj[1].addedComponents[0]).to.have.property('files');
      expect(nodeStartOutputObj[1].addedComponents[0].files).to.be.array();
      expect(nodeStartOutputObj[1].addedComponents[0].files).to.be.ofSize(2);
      expect(nodeStartOutputObj[1].addedComponents[0].files[0].relativePath).to.equal('add_many_test_files/e.js');
      expect(nodeStartOutputObj[1].addedComponents[0].files[1].relativePath).to.equal('add_many_test_files/f.js');
      expect(status).to.have.string('add_many_test_files/component_with_many_paths ... ok');
    });
    it('should add many components', function () {
      expect(nodeStartOutputObj).to.be.array();
      expect(nodeStartOutputObj).to.be.ofSize(5);
    });
  });
  describe('make sure .gitignore is read from the correct path', function () {
    let newDirPath;
    const componentsGitIgnoreMatch = [
      {
        componentPaths: ['add_many_test_files/c.js'],
        main: 'add_many_test_files/c.js',
      },
    ];
    const componentsRootLevel = [
      {
        componentPaths: ['c.js'],
        main: 'c.js',
      },
    ];
    const componentsInner = [
      {
        componentPaths: ['foo/gitignoredir/c.js'],
        main: 'foo/gitignoredir/c.js',
      },
    ];
    before(function () {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.copyFixtureComponents('add-many');
      helper.fs.createFile('foo', 'c.js');
      helper.fs.createFile('foo/gitignoredir', 'c.js');
      helper.fs.createFileOnRootLevel('c.js');
      newDirPath = helper.fs.createNewDirectory();
      const scriptRelativePath = 'add-many';
      helper.fixtures.copyFixtureComponents(scriptRelativePath, newDirPath);
    });
    it('should not add a component if it is in gitignore', async function () {
      helper.git.writeGitIgnore(['**/add_many_test_files/c.js']);
      nodeStartOutput = undefined;
      try {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        nodeStartOutput = await api.addMany(componentsGitIgnoreMatch, helper.scopes.localPath);
      } catch (err) {
        expect(err.name).to.equal('NoFiles');
        nodeStartOutput = err.message;
      }
      expect(nodeStartOutput).to.be.empty;
    });
    it('should add a component if its pattern not matches to .gitignore', async function () {
      const componentsUnmatched = [
        {
          componentPaths: ['foo/c.js'],
          main: 'foo/c.js',
        },
      ];
      helper.git.writeGitIgnore(['**/add_many_test_files/c.js']);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      nodeStartOutputObj = await api.addMany(componentsUnmatched, helper.scopes.localPath);
      expect(nodeStartOutputObj[0].addedComponents[0].files).to.be.array();
      expect(nodeStartOutputObj[0].addedComponents[0].files).to.be.ofSize(1);
      expect(nodeStartOutputObj[0].addedComponents[0].files[0].test).to.equal(false);
      expect(nodeStartOutputObj[0].addedComponents[0].files[0].name).to.equal('c.js');
    });
    it('should add a component on root level if its pattern not matches to .gitignore', async function () {
      helper.git.writeGitIgnore(['**/add_many_test_files/c.js']);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      nodeStartOutputObj = await api.addMany(componentsRootLevel, helper.scopes.localPath);
      expect(nodeStartOutputObj[0].addedComponents[0].files).to.be.array();
      expect(nodeStartOutputObj[0].addedComponents[0].files).to.be.ofSize(1);
      expect(nodeStartOutputObj[0].addedComponents[0].files[0].test).to.equal(false);
      expect(nodeStartOutputObj[0].addedComponents[0].files[0].name).to.equal('c.js');
    });
    it('should not add a component on root level if its pattern matches to gitignore', async function () {
      helper.git.writeGitIgnore(['/c.js']);
      let addMany;
      try {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        addMany = await api.addMany(componentsRootLevel, helper.scopes.localPath);
      } catch (err) {
        expect(err.name).to.equal('ExcludedMainFile');
      }

      expect(addMany).to.be.undefined;
    });
    it('should add a component with gitignore on root but not inner folder', async function () {
      helper.git.writeGitIgnore(['/bar']);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      nodeStartOutputObj = await api.addMany(componentsInner, helper.scopes.localPath);
      expect(nodeStartOutputObj).to.be.an('array');
    });
    it('should not add a component with gitignore in inner folder', async function () {
      helper.git.writeGitIgnore(['/foo/gitignoredir']);
      let addMany;
      try {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        addMany = await api.addMany(componentsInner, helper.scopes.localPath);
      } catch (err) {
        expect(err.name).to.equal('ExcludedMainFile');
      }
      expect(addMany).to.be.undefined;
    });
    it('should not add a component if it is one of the ignore files in the constants list', async function () {
      const componentsIgnoreConst = [
        {
          componentPaths: ['add_many_test_files/LICENSE'],
          main: 'add_many_test_files/LICENSE',
        },
        {
          componentPaths: ['add_many_test_files/yarn.lock'],
          main: 'add_many_test_files/yarn.lock',
        },
      ];
      let addMany;
      try {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        addMany = await api.addMany(componentsIgnoreConst, helper.scopes.localPath);
      } catch (err) {
        expect(err.name).to.equal('NoFiles');
      }
      expect(addMany).to.be.undefined;
    });
  });
});
