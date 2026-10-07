import { expect } from 'chai';
import ValidateGitExec, { DIAGNOSIS_NAME_VALIDATE_GIT_EXEC } from './validate-git-exec';

const GIT_PATH_ENV = 'BIT_CONFIG_GIT_PATH';

describe('bit doctor - git exec validation', function () {
  this.timeout(0);
  let originalGitPath: string | undefined;
  before(() => {
    originalGitPath = process.env[GIT_PATH_ENV];
  });
  afterEach(() => {
    if (originalGitPath === undefined) delete process.env[GIT_PATH_ENV];
    else process.env[GIT_PATH_ENV] = originalGitPath;
  });

  // This test case assumes you have a proper git executable
  describe('without configuration changes', () => {
    let result;
    before(async () => {
      delete process.env[GIT_PATH_ENV];
      result = await new ValidateGitExec().examine();
    });
    it('should run the correct diagnosis', () => {
      expect(result.diagnosisMetaData.name).to.equal(DIAGNOSIS_NAME_VALIDATE_GIT_EXEC);
    });
    it('should pass the diagnosis', () => {
      expect(result.bareResult.valid).to.be.true;
    });
  });

  describe('with wrong git path', () => {
    const wrongGitPath = '/non-existing-dir-for-git-path';
    let result;
    before(async () => {
      process.env[GIT_PATH_ENV] = wrongGitPath;
      result = await new ValidateGitExec().examine();
    });
    it('should fail the diagnosis', () => {
      expect(result.bareResult.valid).to.be.false;
    });
    it('should show the symptoms correctly', () => {
      expect(result.formattedSymptoms).to.equal(`git executable not found (path '${wrongGitPath}')`);
    });
    it('should show the suggestion for fix correctly', () => {
      expect(result.formattedManualTreat).to.equal(
        "please ensure that git is installed and/or git_path is configured correctly - 'bit config set git_path <GIT_PATH>'"
      );
    });
  });
});
