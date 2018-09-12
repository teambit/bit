/* eslint-disable max-lines */
import path from 'path';
import chai, { expect, assert } from 'chai';
import Helper from '../e2e-helper';

chai.use(require('chai-fs'));

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('bit add many programmatically', function () {
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  this.timeout(10000);
  let nodeStartOutputObj;
  let status;
  describe('should transfer wrong and right script path', function () {
    before(() => {
      helper.reInitLocalScope();
      helper.copyFixtureComponents('add-many');
      helper.linkNpm('bit-bin');
    });
    it('should transfer wrong script path ', function () {
      const scriptPath = path.join(helper.localScopePath, 'add_many_test_files/add_components_programmatically.js');
      // Pass non existing path as arg to make sure it won't take the default cwd
      const wrongPathOutput = helper.nodeStart(`${scriptPath} /ninja`);
      expect(wrongPathOutput).to.have.string('ConsumerNotFoundError');
    });
    it('should transfer right script path ', function () {
      const scriptPath = path.join(helper.localScopePath, 'add_many_test_files/add_components_programmatically.js');
      const nodeStartOutput = helper.nodeStart(`${scriptPath} PROCESS`);
      nodeStartOutputObj = JSON.parse(nodeStartOutput);
      expect(nodeStartOutputObj[0]).to.have.property('addedComponents');
      expect(nodeStartOutputObj[0].addedComponents[0]).to.have.property('id');
      expect(nodeStartOutputObj[0].addedComponents[0].id).to.equal('add_many_test_files/c');
    });
  });
  describe('should add many components', function () {
    before(() => {
      helper.reInitLocalScope();
      helper.copyFixtureComponents('add-many');
      helper.linkNpm('bit-bin');
      const nodeStartOutput = helper.nodeStart('add_many_test_files/add_components_programmatically.js');
      nodeStartOutputObj = JSON.parse(nodeStartOutput);
      status = helper.status();
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
      const compData = JSON.parse(helper.showComponentWithOptions('add_many_test_files/c', { j: '' }));
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
      const compData = JSON.parse(helper.showComponentWithOptions('add_many_test_files/my_defined_id', { j: '' }));
      expect(compData).to.have.property('files');
      expect(compData.files[1].relativePath).to.equal('add_many_test_files/a.spec.js');
    });
    it('should add a component with user defined id', function () {
      expect(nodeStartOutputObj).to.be.array();
      expect(nodeStartOutputObj[3]).to.have.property('addedComponents');
      expect(nodeStartOutputObj[3].addedComponents[0].id).to.equal('add_many_test_files/my_defined_id');
      expect(status).to.have.string('add_many_test_files/my_defined_id ... ok');
      const compData = JSON.parse(helper.showComponentWithOptions('add_many_test_files/my_defined_id', { j: '' }));
      expect(compData).to.have.property('name');
      expect(compData.name).to.equal('add_many_test_files/my_defined_id');
    });
    it('should add a component with namespace and no id', function () {
      expect(nodeStartOutputObj).to.be.array();
      expect(nodeStartOutputObj[1]).to.have.property('addedComponents');
      expect(nodeStartOutputObj[1].addedComponents[0].id).to.equal('my_namespace/b');
      expect(status).to.have.string('my_namespace/b ... ok');
      const compData = JSON.parse(helper.showComponentWithOptions('my_namespace/b', { j: '' }));
      expect(compData).to.have.property('name');
      expect(compData.name).to.equal('my_namespace/b');
    });
    it('should add a component with excluded test file', function () {
      expect(nodeStartOutputObj[4].addedComponents[0]).to.have.property('id');
      expect(nodeStartOutputObj[4].addedComponents[0].id).to.equal('add_many_test_files/d');
      expect(nodeStartOutputObj[4].addedComponents[0]).to.have.property('files');
      expect(nodeStartOutputObj[4].addedComponents[0].files).to.be.array();
      expect(nodeStartOutputObj[4].addedComponents[0].files).to.be.ofSize(1);
      expect(nodeStartOutputObj[4].addedComponents[0].files[0].test).to.equal(false);
      expect(status).to.have.string('add_many_test_files/d ... ok');
      const compData = JSON.parse(helper.showComponentWithOptions('add_many_test_files/d', { j: '' }));
      expect(compData).to.not.property('Specs');
    });
    it('should add a component with many files', function () {
      expect(nodeStartOutputObj[2].addedComponents[0]).to.have.property('id');
      expect(nodeStartOutputObj[2].addedComponents[0].id).to.equal('add_many_test_files/component_with_many_paths');
      expect(nodeStartOutputObj[2].addedComponents[0]).to.have.property('files');
      expect(nodeStartOutputObj[2].addedComponents[0].files).to.be.array();
      expect(nodeStartOutputObj[2].addedComponents[0].files).to.be.ofSize(2);
      expect(nodeStartOutputObj[2].addedComponents[0].files[0].relativePath).to.equal('add_many_test_files/e.js');
      expect(nodeStartOutputObj[2].addedComponents[0].files[1].relativePath).to.equal('add_many_test_files/f.js');
      expect(status).to.have.string('add_many_test_files/component_with_many_paths ... ok');
    });
    it('should add many components', function () {
      expect(nodeStartOutputObj).to.be.array();
      expect(nodeStartOutputObj).to.be.ofSize(5);
    });
  });
});
