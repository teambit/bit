/* eslint-disable max-lines */
import chai, { expect } from 'chai';
import Helper from '../e2e-helper';

chai.use(require('chai-fs'));

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('bit add many programatically', function () {
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  this.timeout(10000);
  let nodeStartOutputObj;
  describe('should add many components', function () {
    before(() => {
      helper.reInitLocalScope();
      helper.copyFixtureComponents('add-many');
      helper.linkNpm('bit-bin');
      const nodeStartOutput = helper.nodeStart('add_many_test_files/index_four_components.js');
      nodeStartOutputObj = JSON.parse(nodeStartOutput);
    });
    it('should add 1 component no id and no spec', function () {
      expect(nodeStartOutputObj).to.be.array();
      expect(nodeStartOutputObj[0]).to.have.property('addedComponents');
      expect(nodeStartOutputObj[0].addedComponents[0]).to.have.property('id');
      expect(nodeStartOutputObj[0].addedComponents[0].id).to.equal('add_many_test_files/c');
      expect(nodeStartOutputObj[0].addedComponents[0]).to.have.property('files');
      expect(nodeStartOutputObj[0].addedComponents[0].files).to.be.array();
      expect(nodeStartOutputObj[0].addedComponents[0].files).to.be.ofSize(1);
      expect(nodeStartOutputObj[0].addedComponents[0].files[0].test).to.equal(false);
      const status = helper.status();
      expect(status).to.have.string('add_many_test_files/c ... ok');
      const compData = helper.showComponent('add_many_test_files/c');
      expect(compData).to.not.have.string('Specs');
    });
    it('should add 1 component with spec', function () {
      expect(nodeStartOutputObj).to.be.array();
      expect(nodeStartOutputObj[2]).to.have.property('addedComponents');
      expect(nodeStartOutputObj[2].addedComponents[0].files).to.be.array();
      expect(nodeStartOutputObj[2].addedComponents[0].files).to.be.ofSize(2);
      expect(nodeStartOutputObj[2].addedComponents[0].files[0].test).to.equal(false);
      expect(nodeStartOutputObj[2].addedComponents[0].files[0].name).to.equal('a.js');
      expect(nodeStartOutputObj[2].addedComponents[0].files[1].test).to.equal(true);
      expect(nodeStartOutputObj[2].addedComponents[0].files[1].name).to.equal('a.spec.js');
      const status = helper.status();
      expect(status).to.have.string('add_many_test_files/my_defined_id ... ok');
      const compData = helper.showComponent('add_many_test_files/my_defined_id');
      expect(compData).to.have.string('Specs');
      expect(compData).to.have.string('add_many_test_files/a.spec.js');
    });
    it('should add 1 component user defined id', function () {
      expect(nodeStartOutputObj).to.be.array();
      expect(nodeStartOutputObj[2]).to.have.property('addedComponents');
      expect(nodeStartOutputObj[2].addedComponents[0].id).to.equal('add_many_test_files/my_defined_id');
      const status = helper.status();
      expect(status).to.have.string('add_many_test_files/my_defined_id ... ok');
      const compData = helper.showComponent('add_many_test_files/my_defined_id');
      expect(compData).to.have.string('Id');
      expect(compData).to.have.string('add_many_test_files/my_defined_id');
    });
    it('should add 1 component with namespace and no id', function () {
      expect(nodeStartOutputObj).to.be.array();
      expect(nodeStartOutputObj[1]).to.have.property('addedComponents');
      expect(nodeStartOutputObj[1].addedComponents[0].id).to.equal('my_namespace/b');
      const status = helper.status();
      expect(status).to.have.string('my_namespace/b ... ok');
      const compData = helper.showComponent('my_namespace/b');
      expect(compData).to.have.string('Id');
      expect(compData).to.have.string('my_namespace/b');
    });
    it('should add 1 component with exclude test', function () {
      expect(nodeStartOutputObj[3].addedComponents[0]).to.have.property('id');
      expect(nodeStartOutputObj[3].addedComponents[0].id).to.equal('add_many_test_files/d');
      expect(nodeStartOutputObj[3].addedComponents[0]).to.have.property('files');
      expect(nodeStartOutputObj[3].addedComponents[0].files).to.be.array();
      expect(nodeStartOutputObj[3].addedComponents[0].files).to.be.ofSize(1);
      expect(nodeStartOutputObj[3].addedComponents[0].files[0].test).to.equal(false);
      const status = helper.status();
      expect(status).to.have.string('add_many_test_files/d ... ok');
      const compData = helper.showComponent('add_many_test_files/d');
      expect(compData).to.not.have.string('Specs');
    });
    it('should add many components', function () {
      expect(nodeStartOutputObj).to.be.array();
      expect(nodeStartOutputObj).to.be.ofSize(4);
    });
  });
});
