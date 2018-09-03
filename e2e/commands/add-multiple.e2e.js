/* eslint-disable max-lines */
import chai, { expect } from 'chai';
import Helper from '../e2e-helper';

chai.use(require('chai-fs'));

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

function testArrayItemTest1(nodeStartOutputObj) {
  if (nodeStartOutputObj.addedComponents[0].id === 'add_multiple_test_files/c') {
    expect(JSON.stringify(nodeStartOutputObj)).to.equal(
      JSON.stringify({
        addedComponents: [
          {
            id: 'add_multiple_test_files/c',
            files: [{ relativePath: 'add_multiple_test_files/c.js', test: false, name: 'c.js' }]
          }
        ],
        warnings: {}
      })
    );
  } else if (nodeStartOutputObj.addedComponents[0].id === 'add_multiple_test_files/a') {
    expect(JSON.stringify(nodeStartOutputObj)).to.equal(
      JSON.stringify({
        addedComponents: [
          {
            id: 'add_multiple_test_files/a',
            files: [
              { relativePath: 'add_multiple_test_files/a.js', test: false, name: 'a.js' },
              { relativePath: 'add_multiple_test_files/a.spec.js', test: true, name: 'a.spec.js' }
            ]
          }
        ],
        warnings: {}
      })
    );
  } else {
    expect(JSON.stringify(nodeStartOutputObj)).to.equal(
      JSON.stringify({
        addedComponents: [
          {
            id: 'add_multiple_test_files/b',
            files: [{ relativePath: 'add_multiple_test_files/b.js', test: false, name: 'b.js' }]
          }
        ],
        warnings: {}
      })
    );
  }
}

function testArrayItemTest2(nodeStartOutputObj) {
  if (nodeStartOutputObj.addedComponents[0].id === 'add_multiple_test_files/c') {
    expect(JSON.stringify(nodeStartOutputObj)).to.equal(
      JSON.stringify({
        addedComponents: [
          {
            id: 'add_multiple_test_files/c',
            files: [{ relativePath: 'add_multiple_test_files/c.js', test: false, name: 'c.js' }]
          }
        ],
        warnings: {}
      })
    );
  } else if (nodeStartOutputObj.addedComponents[0].id === 'add_multiple_test_files/a') {
    expect(JSON.stringify(nodeStartOutputObj)).to.equal(
      JSON.stringify({
        addedComponents: [
          {
            id: 'add_multiple_test_files/a',
            files: [{ relativePath: 'add_multiple_test_files/a.js', test: false, name: 'a.js' }]
          }
        ],
        warnings: {}
      })
    );
  }
}

describe('bit add command', function () {
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('should add multiple components', function () {
    it('should add multiple that some has spec files', function () {
      this.timeout(10000);
      helper.reInitLocalScope();
      helper.copyFixtureComponents('add-multiple');
      helper.linkNpm('bit-bin');
      const nodeStartOutput = helper.nodeStart('add_multiple_test_files/index_three_components_with_specs.js');
      const nodeStartOutputObj = JSON.parse(nodeStartOutput);
      testArrayItemTest1(nodeStartOutputObj[0]);
      testArrayItemTest1(nodeStartOutputObj[1]);
      testArrayItemTest1(nodeStartOutputObj[2]);
      const status = helper.status();
      expect(status).to.have.string('add_multiple_test_files/a ... ok');
      expect(status).to.have.string('add_multiple_test_files/b ... ok');
      expect(status).to.have.string('add_multiple_test_files/c ... ok');
      const compData = helper.showComponent('add_multiple_test_files/a');
      expect(compData).to.have.string('Specs');
      expect(compData).to.have.string('add_multiple_test_files/a.spec.js');
    });
    it('should add 2 components with no spec files', function () {
      this.timeout(10000);
      helper.reInitLocalScope();
      helper.copyFixtureComponents('add-multiple');
      helper.linkNpm('bit-bin');
      const nodeStartOutput = helper.nodeStart('add_multiple_test_files/index_two_components_without_specs.js');
      const nodeStartOutputObj = JSON.parse(nodeStartOutput);
      testArrayItemTest2(nodeStartOutputObj[0]);
      testArrayItemTest2(nodeStartOutputObj[1]);
      const status = helper.status();
      expect(status).to.have.string('add_multiple_test_files/a ... ok');
      expect(status).to.have.string('add_multiple_test_files/c ... ok');
      const compData = helper.showComponent('add_multiple_test_files/a');
      expect(compData).to.not.have.string('Specs');
    });
  });
});
