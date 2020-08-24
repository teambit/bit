import chai, { expect } from 'chai';
import * as path from 'path';

import DiagnosisNotFound from '../../src/api/consumer/lib/exceptions/diagnosis-not-found';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('bit doctor infra', function () {
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

  describe('run all diagnoses', () => {
    let output;
    let parsedOutput;

    before(() => {
      output = helper.command.doctor({ j: '' });
      parsedOutput = JSON.parse(output);
    });
    it('should return all the fields for each check', () => {
      const examineResults = parsedOutput.examineResults;
      expect(examineResults).to.be.an('array');
      examineResults.forEach((checkResult) => {
        expect(checkResult).to.satisfy(_validateCheckResultFormat);
      });
    });

    describe('save results as tar file', () => {
      describe('with default file name', () => {
        before(() => {
          output = helper.command.doctor({ save: '' });
        });
        it('should print the output file name', () => {
          expect(output).to.have.string('File written to doctor-results-');
          expect(output).to.have.string('.tar');
        });
        it('should create a non empty tar file in the file system', () => {
          output = helper.command.doctor({ save: '', j: '' });
          parsedOutput = JSON.parse(output);
          const filePath = parsedOutput.savedFilePath;
          const fileFullPath = path.join(helper.scopes.localPath, filePath);
          expect(fileFullPath).to.be.a.file().and.not.empty;
        });
      });
      describe('with provided file name', () => {
        const fileNameWithoutExt = 'doc-file';
        const fileName = `${fileNameWithoutExt}.tar`;
        before(() => {
          output = helper.command.doctor({ save: fileNameWithoutExt });
        });
        it('should print the output file name with tar extension', () => {
          expect(output).to.have.string(`File written to ${fileName}`);
        });
        it('should create a non empty tar file in the file system', () => {
          const fileFullPath = path.join(helper.scopes.localPath, fileName);
          expect(fileFullPath).to.be.a.file().and.not.empty;
        });
      });
    });
  });

  describe('run one diagnosis', () => {
    it('should show error when the diagnosis not exist', () => {
      const nonExistingDiagnosis = 'non-existing-diagnosis';
      const useFunc = () => helper.command.doctorOne(nonExistingDiagnosis, { j: '' });
      const error = new DiagnosisNotFound(nonExistingDiagnosis);
      helper.general.expectToThrow(useFunc, error);
    });
  });

  describe('list all checks', () => {
    let output;
    let parsedOutput;

    before(() => {
      output = helper.command.doctorList({ j: '' });
      parsedOutput = JSON.parse(output);
    });
    it('should return all the fields for each check item', () => {
      expect(parsedOutput).to.be.an('array');
      parsedOutput.forEach((checkResult) => {
        expect(checkResult).to.satisfy(_validateCheckItemFormat);
      });
    });
  });
});

function _validateCheckResultFormat(checkResult) {
  return (
    checkResult.diagnosisMetaData &&
    typeof checkResult.diagnosisMetaData.category === 'string' &&
    typeof checkResult.diagnosisMetaData.name === 'string' &&
    typeof checkResult.diagnosisMetaData.description === 'string' &&
    checkResult.bareResult &&
    typeof checkResult.bareResult.valid === 'boolean' &&
    typeof checkResult.formattedSymptoms === 'string' &&
    typeof checkResult.formattedManualTreat === 'string'
  );
}

function _validateCheckItemFormat(checkItem) {
  return (
    checkItem &&
    typeof checkItem.category === 'string' &&
    typeof checkItem.name === 'string' &&
    typeof checkItem.description === 'string'
  );
}
