import fs from 'fs-extra';
import path from 'path';
import chai, { expect } from 'chai';
import Helper from '../e2e-helper';
import { DIAGNOSIS_NAME } from '../../src/doctor/core-diagnoses/broken-symlink-files';

chai.use(require('chai-fs'));

describe('copy workspace with env', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('coping a workspace with a compiler to another directory', () => {
    let copiedPath;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.importCompiler('bit.envs/compilers/react-typescript');

      copiedPath = helper.cloneLocalScope();
      // remove the original workspace so then symlinks get invalid
      fs.removeSync(helper.localScopePath);
    });
    it('bit status should throw an exception', () => {
      const func = () => helper.runCmd('bit status', copiedPath);
      expect(func).to.throw();
    });
    it('bit doctor should diagnose the issue and suggest a solution to delete the env path', () => {
      const output = helper.doctorOne(DIAGNOSIS_NAME, { j: '' }, copiedPath);
      const parsedDoctor = JSON.parse(output);
      expect(parsedDoctor.examineResult).to.have.property('bareResult');
      const results = parsedDoctor.examineResult.bareResult;
      expect(results.valid).to.be.false;
      expect(results.data.brokenSymlinks[0].pathToDelete).to.have.string(
        path.normalize('.bit/components/compilers/react-typescript')
      );
    });
  });
});
