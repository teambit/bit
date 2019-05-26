import { expect } from 'chai';
import Helper from '../e2e-helper';
import { DIAGNOSIS_NAME } from '../../src/doctor/core-diagnoses/validate-git-exec';

describe('bit doctor - git exe validation', function () {
  this.timeout(0);
  const helper = new Helper();

  after(() => {
    helper.destroyEnv();
  });

  before(() => {
    helper.reInitLocalScope();
  });

  // This test case assume you have proper configuration of git executable
  describe('without configuration changes', () => {
    let parsedOutput;
    before(() => {
      const output = helper.doctorOne(DIAGNOSIS_NAME, { j: '' });
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
      const oldGitPath = helper.getGitPath();
      // Set the git path to a place where there is no git (the local scope)
      helper.setGitPath(helper.localScopePath);
      const output = helper.doctorOne(DIAGNOSIS_NAME, { j: '' });
      helper.restoreGitPath(oldGitPath);
      parsedOutput = JSON.parse(output);
    });
    it('should run the correct diagnosis', () => {
      expect(parsedOutput.examineResult.diagnosisMetaData.name).to.equal(DIAGNOSIS_NAME);
    });
    it('should fail the diagnosis', () => {
      expect(parsedOutput.examineResult.bareResult.valid).to.be.false;
    });
    it('should show the symptoms correctly', () => {
      const formattedSymptoms = `git executable not found (on path '${helper.localScopePath}')`;
      expect(parsedOutput.examineResult.formattedSymptoms).to.equal(formattedSymptoms);
    });
    it('should show the suggestion for fix correctly', () => {
      const formattedManualTreat =
        "please ensure git is installed and/or git_path is configured using the 'bit config set git_path <GIT_PATH>'";
      expect(parsedOutput.examineResult.formattedManualTreat).to.equal(formattedManualTreat);
    });
  });
});
