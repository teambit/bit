import chai, { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';

import Helper from '../../src/e2e-helper/e2e-helper';

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('run bit isolate', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  // TODO: Ipmlement! important! (there were conflicts during merge which not checked yet)
  // Validate each of the flags (espcially conf, dist, directory, noPackageJson)
  // Validate default flags
  describe('components with dependencies', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithThreeComponents();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
    });
    describe('with the same parameters as pack is using', () => {
      let isolatePath;
      before(() => {
        isolatePath = helper.command.isolateComponent('bar/foo', '-owls');
      });
      it('should be able to generate the links correctly and require the dependencies', () => {
        const appJsFixture = `const barFoo = require('./');
console.log(barFoo());`;
        fs.outputFileSync(path.join(isolatePath, 'app.js'), appJsFixture);
        const result = helper.command.runCmd('node app.js', isolatePath);
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
    });
  });
});
