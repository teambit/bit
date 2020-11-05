import chai, { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';

import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import { Extensions } from '../../src/constants';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('start Swit', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(HARMONY_FEATURE);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('start', () => {
    describe('Start 1', () => {
      it.only('should print verbose output', () => {
        const cmdOutput = helper.command.runCmd('bit start -v');
        const capsules = JSON.parse(cmdOutput);
        capsules.capsules.forEach((c) => expect(c).to.not.have.string('comp1'));
      });

      it.skip('Start 2', () => {
        // const result = helper.command.runCmd('node app.js');
      });
    });
  });
});
