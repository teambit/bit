// covers also init, create, commit, modify commands

import { expect } from 'chai';
import path from 'path';
import fs from 'fs-extra';
import Helper from '../e2e-helper';

describe('bit config', function () {
  this.timeout(0);
  let helper;
  before(() => {
    helper = new Helper();
  });

  it('should not throw an error (on linux)', () => {
    helper.reInitLocalScope();
    const output = helper.runCmd('bit config');
    expect(output).to.be.equal('\n');
  });
});
