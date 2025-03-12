import path from 'path';
import { globalBitTempDir } from '@teambit/defender.fs.global-bit-temp-dir';
import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('linking to a target', function () {
  this.timeout(0);
  let helper: Helper;
  let targetDir: string;
  before(() => {
    helper = new Helper();
    helper.scopeHelper.setWorkspaceWithRemoteScope();
    helper.fixtures.populateComponents(1);
    targetDir = globalBitTempDir();
    helper.command.link(`--target=${targetDir}`);
  });
  it('should link the components to the target directory', () => {
    expect(path.join(targetDir, `node_modules/@${helper.scopes.remote}`)).to.be.a.path();
  });
});

describe('linking to a target including peers', function () {
  this.timeout(0);
  let helper: Helper;
  let targetDir: string;
  before(() => {
    helper = new Helper();
    helper.scopeHelper.setWorkspaceWithRemoteScope();
    helper.command.create('react', 'button', '--env teambit.react/react');
    helper.command.install();
    targetDir = globalBitTempDir();
    helper.command.link(`--target=${targetDir} --peers`);
  });
  it('should link the components to the target directory', () => {
    expect(path.join(targetDir, `node_modules/@${helper.scopes.remote}`)).to.be.a.path();
  });
  it('should link the peers of the component components to the target directory', () => {
    expect(path.join(targetDir, 'node_modules/react')).to.be.a.path();
    expect(path.join(targetDir, 'node_modules/react-dom')).to.be.a.path();
  });
});
