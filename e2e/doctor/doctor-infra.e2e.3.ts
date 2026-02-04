import chai, { expect } from 'chai';
import * as path from 'path';
import { execSync } from 'child_process';

import { DiagnosisNotFound } from '@teambit/doctor';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
chai.use(chaiFs);

describe('bit doctor infra', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });

  after(() => {
    helper.scopeHelper.destroy();
  });

  before(() => {
    helper.scopeHelper.reInitWorkspace();
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

  describe('archive with --exclude-local-scope flag', () => {
    let tarEntries: string[];
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      const archivePath = path.join(helper.scopes.localPath, 'doctor-archive');
      // Run from a nested directory to trigger the bug (workspaceRoot becomes absolute path)
      const nestedDir = path.join(helper.scopes.localPath, 'comp1');
      helper.command.runCmd(`bit doctor --archive ${archivePath} --exclude-local-scope`, nestedDir);
      // List tar entries using tar command (doctor adds .tar extension)
      const tarOutput = execSync(`tar -tzf "${archivePath}.tar"`, { encoding: 'utf8' });
      tarEntries = tarOutput.trim().split('\n');
    });
    it('should exclude .bit/objects contents', () => {
      const objectsContents = tarEntries.filter((e) => e.includes('.bit/objects/'));
      expect(objectsContents).to.have.lengthOf(0);
    });
    it('should exclude .bit/cache contents', () => {
      const cacheContents = tarEntries.filter((e) => e.includes('.bit/cache/'));
      expect(cacheContents).to.have.lengthOf(0);
    });
    it('should exclude .bit/tmp contents', () => {
      const tmpContents = tarEntries.filter((e) => e.includes('.bit/tmp/'));
      expect(tmpContents).to.have.lengthOf(0);
    });
    it('should include .bit/command-history', () => {
      const commandHistoryEntries = tarEntries.filter((e) => e.includes('.bit/command-history'));
      expect(commandHistoryEntries).to.have.lengthOf.at.least(1);
    });
    it('should include .bit/scope.json', () => {
      const scopeJsonEntries = tarEntries.filter((e) => e.includes('.bit/scope.json'));
      expect(scopeJsonEntries).to.have.lengthOf(1);
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

  describe('validate scope objects diagnosis', () => {
    let parsedOutput;
    let headHash;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
    });

    describe('when all objects are present', () => {
      before(() => {
        const output = helper.command.doctorOne('validate scope objects', { j: '' });
        parsedOutput = JSON.parse(output);
      });
      it('should pass the diagnosis', () => {
        expect(parsedOutput.examineResult.bareResult.valid).to.be.true;
      });
      it('should have empty symptoms when valid', () => {
        // When valid, the base Diagnosis class returns empty strings
        expect(parsedOutput.examineResult.formattedSymptoms).to.equal('');
      });
    });

    describe('when head version object is missing', () => {
      before(() => {
        // Get the head hash and delete the version object from remote scope
        headHash = helper.command.getHead('comp1');
        const hashPath = helper.general.getHashPathOfObject(headHash);
        helper.fs.deleteRemoteObject(hashPath);

        const output = helper.command.doctorOne('validate scope objects', { j: '', remote: helper.scopes.remote });
        parsedOutput = JSON.parse(output);
      });
      it('should fail the diagnosis', () => {
        expect(parsedOutput.examineResult.bareResult.valid).to.be.false;
      });
      it('should show the component with missing head in symptoms', () => {
        expect(parsedOutput.examineResult.formattedSymptoms).to.include('comp1');
        expect(parsedOutput.examineResult.formattedSymptoms).to.include(headHash);
      });
      it('should suggest restoring from backups', () => {
        expect(parsedOutput.examineResult.formattedManualTreat).to.include('restored from backups');
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
