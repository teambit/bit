import chai, { expect } from 'chai';
import Helper from '../e2e-helper';

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('run bit isolate', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  // TODO: Ipmlement! important! (there were conflicts during merge which not checked yet)
  // Validate each of the flags (espcially conf, dist, directory, noPackageJson)
  // Validate default flags
});
