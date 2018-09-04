/* eslint-disable max-lines */
import chai, { expect } from 'chai';
import Helper from '../e2e-helper';

chai.use(require('chai-fs'));

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('bit add command', function () {
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('should add multiple components', function () {
    it('should add 1 component no id and no spec', function () {
      this.timeout(10000);
      helper.reInitLocalScope();
      helper.copyFixtureComponents('add-multiple');
      helper.linkNpm('bit-bin');
      const nodeStartOutput = helper.nodeStart('add_multiple_test_files/index_add_one_component_no_id_and_spec.js');
      const nodeStartOutputObj = JSON.parse(nodeStartOutput);
      expect(nodeStartOutputObj).to.be.array();
      expect(nodeStartOutputObj).to.be.ofSize(1);
      expect(nodeStartOutputObj[0]).to.have.property('addedComponents');
      expect(nodeStartOutputObj[0].addedComponents).to.be.array();
      expect(nodeStartOutputObj[0].addedComponents).to.be.ofSize(1);
      expect(nodeStartOutputObj[0].addedComponents[0]).to.have.property('id');
      expect(nodeStartOutputObj[0].addedComponents[0].id).to.equal('add_multiple_test_files/a');
      expect(nodeStartOutputObj[0].addedComponents[0]).to.have.property('files');
      expect(nodeStartOutputObj[0].addedComponents[0].files).to.be.array();
      expect(nodeStartOutputObj[0].addedComponents[0].files).to.be.ofSize(1);
      expect(nodeStartOutputObj[0].addedComponents[0].files[0].test).to.equal(false);
      const status = helper.status();
      expect(status).to.have.string('add_multiple_test_files/a ... ok');
      const compData = helper.showComponent('add_multiple_test_files/a');
      expect(compData).to.not.have.string('Specs');
    });
    it('should add 1 component no id and with spec', function () {
      this.timeout(10000);
      helper.reInitLocalScope();
      helper.copyFixtureComponents('add-multiple');
      helper.linkNpm('bit-bin');
      const nodeStartOutput = helper.nodeStart(
        'add_multiple_test_files/index_add_one_component_no_id_and_with_spec.js'
      );
      const nodeStartOutputObj = JSON.parse(nodeStartOutput);
      expect(nodeStartOutputObj).to.be.array();
      expect(nodeStartOutputObj).to.be.ofSize(1);
      expect(nodeStartOutputObj[0]).to.have.property('addedComponents');
      expect(nodeStartOutputObj[0].addedComponents[0].files).to.be.array();
      expect(nodeStartOutputObj[0].addedComponents[0].files).to.be.ofSize(2);
      expect(nodeStartOutputObj[0].addedComponents[0].files[0].test).to.equal(false);
      expect(nodeStartOutputObj[0].addedComponents[0].files[0].name).to.equal('a.js');
      expect(nodeStartOutputObj[0].addedComponents[0].files[1].test).to.equal(true);
      expect(nodeStartOutputObj[0].addedComponents[0].files[1].name).to.equal('a.spec.js');
      const status = helper.status();
      expect(status).to.have.string('add_multiple_test_files/a ... ok');
      const compData = helper.showComponent('add_multiple_test_files/a');
      expect(compData).to.have.string('Specs');
      expect(compData).to.have.string('add_multiple_test_files/a.spec.js');
    });
    it('should add 1 component user defined id', function () {
      this.timeout(10000);
      helper.reInitLocalScope();
      helper.copyFixtureComponents('add-multiple');
      helper.linkNpm('bit-bin');
      const nodeStartOutput = helper.nodeStart('add_multiple_test_files/index_add_one_component_user_defined_id.js');
      const nodeStartOutputObj = JSON.parse(nodeStartOutput);
      expect(nodeStartOutputObj).to.be.array();
      expect(nodeStartOutputObj).to.be.ofSize(1);
      expect(nodeStartOutputObj[0]).to.have.property('addedComponents');
      expect(nodeStartOutputObj[0].addedComponents[0].id).to.equal('add_multiple_test_files/my_defined_id');
      const status = helper.status();
      expect(status).to.have.string('add_multiple_test_files/my_defined_id ... ok');
      const compData = helper.showComponent('add_multiple_test_files/my_defined_id');
      expect(compData).to.have.string('Id');
      expect(compData).to.have.string('add_multiple_test_files/my_defined_id');
    });
    it('should add 1 component with namespace and no id', function () {
      this.timeout(10000);
      helper.reInitLocalScope();
      helper.copyFixtureComponents('add-multiple');
      helper.linkNpm('bit-bin');
      const nodeStartOutput = helper.nodeStart('add_multiple_test_files/index_add_one_component_with_namespace.js');
      const nodeStartOutputObj = JSON.parse(nodeStartOutput);
      expect(nodeStartOutputObj).to.be.array();
      expect(nodeStartOutputObj).to.be.ofSize(1);
      expect(nodeStartOutputObj[0]).to.have.property('addedComponents');
      expect(nodeStartOutputObj[0].addedComponents[0].id).to.equal('my_namespace/a');
      const status = helper.status();
      expect(status).to.have.string('my_namespace/a ... ok');
      const compData = helper.showComponent('my_namespace/a');
      expect(compData).to.have.string('Id');
      expect(compData).to.have.string('my_namespace/a');
    });
    it('should add 1 component with exclude test', function () {
      this.timeout(10000);
      helper.reInitLocalScope();
      helper.copyFixtureComponents('add-multiple');
      helper.linkNpm('bit-bin');
      const nodeStartOutput = helper.nodeStart('add_multiple_test_files/index_add_one_component_with_exclude.js');
      const nodeStartOutputObj = JSON.parse(nodeStartOutput);
      expect(nodeStartOutputObj[0].addedComponents[0]).to.have.property('id');
      expect(nodeStartOutputObj[0].addedComponents[0].id).to.equal('add_multiple_test_files/a');
      expect(nodeStartOutputObj[0].addedComponents[0]).to.have.property('files');
      expect(nodeStartOutputObj[0].addedComponents[0].files).to.be.array();
      expect(nodeStartOutputObj[0].addedComponents[0].files).to.be.ofSize(1);
      expect(nodeStartOutputObj[0].addedComponents[0].files[0].test).to.equal(false);
      const status = helper.status();
      expect(status).to.have.string('add_multiple_test_files/a ... ok');
      const compData = helper.showComponent('add_multiple_test_files/a');
      expect(compData).to.not.have.string('Specs');
    });
    it('should add multiple components', function () {
      this.timeout(10000);
      helper.reInitLocalScope();
      helper.copyFixtureComponents('add-multiple');
      helper.linkNpm('bit-bin');
      const nodeStartOutput = helper.nodeStart('add_multiple_test_files/index_three_components_with_specs.js');
      const nodeStartOutputObj = JSON.parse(nodeStartOutput);
      expect(nodeStartOutputObj).to.be.array();
      expect(nodeStartOutputObj).to.be.ofSize(3);
      const status = helper.status();
      expect(status).to.have.string('add_multiple_test_files/a ... ok');
      expect(status).to.have.string('add_multiple_test_files/b ... ok');
      expect(status).to.have.string('add_multiple_test_files/c ... ok');
      const compData = helper.showComponent('add_multiple_test_files/a');
      expect(compData).to.have.string('Specs');
      expect(compData).to.have.string('add_multiple_test_files/a.spec.js');
    });
  });
});
