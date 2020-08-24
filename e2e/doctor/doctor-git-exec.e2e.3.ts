import { expect } from 'chai';

import { DIAGNOSIS_NAME } from '../../src/doctor/core-diagnoses/validate-git-exec';
import Helper from '../../src/e2e-helper/e2e-helper';

describe('bit doctor - git exec validation', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });

  after(() => {
    helper.scopeHelper.destroy();
  });

  before(() => {
    helper.scopeHelper.reInitLocalScope();
  });

  // This test case assume you have proper configuration of git executable
  describe('without configuration changes', () => {
    let parsedOutput;
    before(() => {
      const output = helper.command.doctorOne(DIAGNOSIS_NAME, { j: '' });
      parsedOutput = JSON.parse(output);
    });
    it('should run the correct diagnosis', () => {
      expect(parsedOutput.examineResult.diagnosisMetaData.name).to.equal(DIAGNOSIS_NAME);
    });
    it('should pass the diagnosis', () => {
      expect(parsedOutput.examineResult.bareResult.valid).to.be.true;
    });
  });

  // This test will change the bit 'git_path' config in order to make it wrong
  // In the end it will restore your old value
  // It might crash in the middle and corrupt your git_path config
  describe('with wrong git path', () => {
    let parsedOutput;
    before(() => {
      let oldGitPath;
      try {
        oldGitPath = helper.config.getGitPath();
      } catch {
        // eslint-disable-next-line no-console
        console.log('no old git path to restore');
      }
      // Set the git path to a place where there is no git (the local scope)
      helper.config.setGitPath(helper.scopes.localPath);
      const output = helper.command.doctorOne(DIAGNOSIS_NAME, { j: '' });
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      helper.config.restoreGitPath(oldGitPath);
      parsedOutput = JSON.parse(output);
    });
    it('should run the correct diagnosis', () => {
      expect(parsedOutput.examineResult.diagnosisMetaData.name).to.equal(DIAGNOSIS_NAME);
    });
    it('should fail the diagnosis', () => {
      expect(parsedOutput.examineResult.bareResult.valid).to.be.false;
    });
    it('should show the symptoms correctly', () => {
      const formattedSymptoms = `git executable not found (path '${helper.scopes.localPath}')`;
      expect(parsedOutput.examineResult.formattedSymptoms).to.equal(formattedSymptoms);
    });
    it('should show the suggestion for fix correctly', () => {
      const formattedManualTreat =
        "please ensure that git is installed and/or git_path is configured correctly - 'bit config set git_path <GIT_PATH>'";
      expect(parsedOutput.examineResult.formattedManualTreat).to.equal(formattedManualTreat);
    });
  });
});
