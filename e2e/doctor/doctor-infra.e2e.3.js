import path from 'path';
import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import DiagnosisNotFound from '../../src/api/consumer/lib/exceptions/diagnosis-not-found';

chai.use(require('chai-fs'));

describe('bit doctor infra', function () {
  this.timeout(0);
  const helper = new Helper();

  after(() => {
    helper.destroyEnv();
  });

  before(() => {
    helper.reInitLocalScope();
  });

  describe('run all diagnoses', () => {
    let output;
    let parsedOutput;

    before(() => {
      output = helper.doctor({ j: '' });
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
          output = helper.doctor({ save: '' });
        });
        it('should print the output file name', () => {
          expect(output).to.have.string('File written to doctor-results-');
          expect(output).to.have.string('.tar');
        });
        it('should create a non empty tar file in the file system', () => {
          output = helper.doctor({ save: '', j: '' });
          parsedOutput = JSON.parse(output);
          const filePath = parsedOutput.savedFilePath;
          const fileFullPath = path.join(helper.localScopePath, filePath);
          expect(fileFullPath).to.be.a.file().and.not.empty;
        });
      });
      describe('with provided file name', () => {
        const fileNameWithoutExt = 'doc-file';
        const fileName = `${fileNameWithoutExt}.tar`;
        before(() => {
          output = helper.doctor({ save: fileNameWithoutExt });
        });
        it('should print the output file name with tar extension', () => {
          expect(output).to.have.string(`File written to ${fileName}`);
        });
        it('should create a non empty tar file in the file system', () => {
          const fileFullPath = path.join(helper.localScopePath, fileName);
          expect(fileFullPath).to.be.a.file().and.not.empty;
        });
      });
    });
  });

  describe('run one diagnosis', () => {
    it('should show error when the diagnosis not exist', () => {
      const nonExistingDiagnosis = 'non-existing-diagnosis';
      const useFunc = () => helper.doctorOne(nonExistingDiagnosis, { j: '' });
      const error = new DiagnosisNotFound(nonExistingDiagnosis);
      helper.expectToThrow(useFunc, error);
    });
  });

  describe('list all checks', () => {
    let output;
    let parsedOutput;

    before(() => {
      output = helper.doctorList({ j: '' });
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
