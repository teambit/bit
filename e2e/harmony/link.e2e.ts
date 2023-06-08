import path from 'path';
import { globalBitTempDir } from '@teambit/defender.fs.global-bit-temp-dir';
import Helper from '../../src/e2e-helper/e2e-helper';
import chai, { expect } from 'chai';

chai.use(require('chai-fs'));

describe('linking to a target', function () {
  this.timeout(0);
  let helper: Helper;
  let targetDir: string;
  before(() => {
    helper = new Helper();
    helper.scopeHelper.setNewLocalAndRemoteScopes();
    helper.fixtures.populateComponents(1);
    targetDir = globalBitTempDir();
    helper.command.link(`--target=${targetDir}`);
  });
  it('should link the components to the target directory', () => {
    expect(path.join(targetDir, `node_modules/@${helper.scopes.remote}`)).to.be.a.path();
  });
});
