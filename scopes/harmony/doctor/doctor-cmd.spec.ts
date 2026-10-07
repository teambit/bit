import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import tar from 'tar-stream';
import stripAnsi from 'strip-ansi';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents } from '@teambit/component.testing.mock-components';
import { WorkspaceAspect } from '@teambit/workspace';
import { ScopeAspect } from '@teambit/scope';
import type { SnappingMain } from '@teambit/snapping';
import { SnappingAspect } from '@teambit/snapping';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import { ExportAspect } from '@teambit/export';
import { Scope, loadScope } from '@teambit/legacy.scope';
import { DoctorAspect } from './doctor.aspect';
import type { DoctorMain } from './doctor.main.runtime';
import { DoctorCmd } from './doctor-cmd';
import { DiagnosisNotFound } from './exceptions/diagnosis-not-found';

/**
 * "bit doctor": running all/one diagnoses, listing them, saving the results and archiving the workspace.
 * one harmony load stands in for a process per command.
 */
describe('bit doctor infra', function () {
  this.timeout(0);

  const workspaces: WorkspaceData[] = [];

  async function setup({ tag = false, exportComps = false, withComponent = false } = {}) {
    const workspaceData = mockWorkspace();
    workspaces.push(workspaceData);
    if (withComponent || tag || exportComps) await mockComponents(workspaceData.workspacePath);
    if (tag || exportComps) {
      const harmony = await loadManyAspects([WorkspaceAspect, SnappingAspect], workspaceData.workspacePath);
      await harmony.get<SnappingMain>(SnappingAspect.id).tag({ build: false, version: '0.0.1' });
    }
    if (exportComps) {
      const harmony = await loadManyAspects([WorkspaceAspect, ExportAspect, ScopeAspect], workspaceData.workspacePath);
      const exportCmd = harmony.get<CLIMain>(CLIAspect.id).getCommand('export');
      await exportCmd?.report?.([[] as any], {});
    }
    return workspaceData;
  }

  /** a fresh harmony load is what a new process gets. the doctor command is created the way the aspect does */
  async function loadDoctor(workspacePath: string) {
    // a new process has no scope in memory (with its cached objects) from the previous commands
    Scope.scopeCache = {};
    const harmony = await loadManyAspects([WorkspaceAspect, DoctorAspect, ScopeAspect], workspacePath);
    const doctor = harmony.get<DoctorMain>(DoctorAspect.id);
    return { doctorCmd: new DoctorCmd(doctor), harmony };
  }

  /** the command resolves paths and the workspace against the cwd, which is where the user runs it from */
  async function inDir<T>(dir: string, fn: () => Promise<T>): Promise<T> {
    const originalCwd = process.cwd();
    process.chdir(dir);
    try {
      return await fn();
    } finally {
      process.chdir(originalCwd);
    }
  }

  function getTarEntries(tarPath: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const entries: string[] = [];
      const extract = tar.extract();
      extract.on('entry', (header, stream, next) => {
        entries.push(header.name);
        stream.on('end', next);
        stream.resume();
      });
      extract.on('finish', () => resolve(entries));
      extract.on('error', reject);
      fs.createReadStream(tarPath).pipe(extract);
    });
  }

  function validateCheckResultFormat(checkResult) {
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

  function validateCheckItemFormat(checkItem) {
    return (
      checkItem &&
      typeof checkItem.category === 'string' &&
      typeof checkItem.name === 'string' &&
      typeof checkItem.description === 'string'
    );
  }

  after(async () => {
    await Promise.all(workspaces.map((workspaceData) => destroyWorkspace(workspaceData)));
  });

  describe('run all diagnoses and save the results as a tar file', () => {
    let workspacePath: string;
    let doctorCmd: DoctorCmd;
    before(async () => {
      ({ workspacePath } = await setup());
      ({ doctorCmd } = await loadDoctor(workspacePath));
    });
    it('should return all the fields for each check', async () => {
      const parsedOutput: any = await inDir(workspacePath, () => doctorCmd.json([], {}));
      const examineResults = parsedOutput.examineResults;
      expect(examineResults).to.be.an('array');
      examineResults.forEach((checkResult) => {
        expect(checkResult).to.satisfy(validateCheckResultFormat);
      });
    });

    describe('with default file name', () => {
      it('should print the output file name', async () => {
        const output = stripAnsi(await inDir(workspacePath, () => doctorCmd.report([], { save: true } as any)));
        expect(output).to.have.string('File written to doctor-results-');
        expect(output).to.have.string('.tar');
      });
      it('should create a non empty tar file in the file system', async () => {
        const parsedOutput: any = await inDir(workspacePath, () => doctorCmd.json([], { save: true } as any));
        const fileFullPath = path.join(workspacePath, parsedOutput.savedFilePath);
        expect(fs.existsSync(fileFullPath)).to.be.true;
        expect(fs.statSync(fileFullPath).size).to.be.greaterThan(0);
      });
    });
    describe('with provided file name', () => {
      const fileNameWithoutExt = 'doc-file';
      const fileName = `${fileNameWithoutExt}.tar`;
      let output: string;
      before(async () => {
        output = stripAnsi(await inDir(workspacePath, () => doctorCmd.report([], { save: fileNameWithoutExt })));
      });
      it('should print the output file name with tar extension', () => {
        expect(output).to.have.string(`File written to ${fileName}`);
      });
      it('should create a non empty tar file in the file system', () => {
        const fileFullPath = path.join(workspacePath, fileName);
        expect(fs.existsSync(fileFullPath)).to.be.true;
        expect(fs.statSync(fileFullPath).size).to.be.greaterThan(0);
      });
    });
  });

  describe('run one diagnosis', () => {
    it('should show error when the diagnosis not exist', async () => {
      const { workspacePath } = await setup();
      const { doctorCmd } = await loadDoctor(workspacePath);
      const nonExistingDiagnosis = 'non-existing-diagnosis';
      const error = new DiagnosisNotFound(nonExistingDiagnosis);
      let thrown: Error | undefined;
      try {
        await inDir(workspacePath, () => doctorCmd.json([nonExistingDiagnosis], {}));
      } catch (err: any) {
        thrown = err;
      }
      expect(thrown, 'expected the command to throw').to.not.be.undefined;
      expect(stripAnsi(thrown!.message)).to.have.string(stripAnsi(error.message));
    });
  });

  describe('archive with --exclude-local-scope flag', () => {
    let tarEntries: string[];
    before(async () => {
      const { workspacePath } = await setup({ tag: true });
      // the command-history file is written by the CLI process (not by the in-process aspects), so simulate it
      await fs.outputFile(path.join(workspacePath, '.bit/command-history'), 'tag\n');
      await fs.outputFile(path.join(workspacePath, '.bit/cache/some-cache-file'), 'cache');
      await fs.outputFile(path.join(workspacePath, '.bit/tmp/some-tmp-file'), 'tmp');
      const { doctorCmd } = await loadDoctor(workspacePath);
      const archivePath = path.join(workspacePath, 'doctor-archive');
      // Run from a nested directory to trigger the bug (workspaceRoot becomes absolute path)
      const nestedDir = path.join(workspacePath, 'comp1');
      await inDir(nestedDir, () => doctorCmd.report([], { archive: archivePath, excludeLocalScope: true }));
      // doctor adds .tar extension
      tarEntries = await getTarEntries(`${archivePath}.tar`);
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

  describe('archive should exclude previously created doctor-results archives', () => {
    let workspacePath: string;
    let secondArchiveEntries: string[];
    const firstArchiveName = 'doctor-results-1000000000000.tar';
    const secondArchiveName = 'doctor-results-2000000000000.tar';
    before(async () => {
      ({ workspacePath } = await setup({ withComponent: true }));
      const { doctorCmd } = await loadDoctor(workspacePath);
      const firstPath = path.join(workspacePath, firstArchiveName);
      await inDir(workspacePath, () => doctorCmd.report([], { archive: firstPath }));
      const secondPath = path.join(workspacePath, secondArchiveName);
      await inDir(workspacePath, () => doctorCmd.report([], { archive: secondPath }));
      secondArchiveEntries = await getTarEntries(secondPath);
    });
    it('should create the first archive on disk', () => {
      const firstArchivePath = path.join(workspacePath, firstArchiveName);
      expect(fs.existsSync(firstArchivePath)).to.be.true;
      expect(fs.statSync(firstArchivePath).size).to.be.greaterThan(0);
    });
    it('should archive workspace files (sanity check)', () => {
      const workspaceFiles = secondArchiveEntries.filter((e) => e.includes('workspace.jsonc'));
      expect(workspaceFiles).to.have.lengthOf.at.least(1);
    });
    it('should not include the previously created doctor-results archive', () => {
      const matched = secondArchiveEntries.filter((e) => /(^|\/)doctor-results-\d+\.tar(\.gz)?$/.test(e));
      expect(matched).to.have.lengthOf(0);
    });
  });

  describe('list all checks', () => {
    it('should return all the fields for each check item', async () => {
      const { workspacePath } = await setup();
      const { doctorCmd } = await loadDoctor(workspacePath);
      const parsedOutput: any = await inDir(workspacePath, () => doctorCmd.json([], { list: true }));
      // the json of a list is the diagnoses themselves, which the CLI serializes with their meta fields
      const checkItems = JSON.parse(JSON.stringify(parsedOutput));
      expect(checkItems).to.be.an('array');
      checkItems.forEach((checkResult) => {
        expect(checkResult).to.satisfy(validateCheckItemFormat);
      });
    });
  });

  describe('validate scope objects diagnosis', () => {
    let workspaceData: WorkspaceData;
    let headHash: string;
    let doctorCmd: DoctorCmd;
    before(async () => {
      workspaceData = await setup({ exportComps: true });
      const loaded = await loadDoctor(workspaceData.workspacePath);
      doctorCmd = loaded.doctorCmd;
      // the head to delete is the one the remote has (the export changes the hash of what was tagged locally)
      const remoteScope = await loadScope(workspaceData.remoteScopePath);
      const [modelComponent] = await remoteScope.list();
      headHash = modelComponent.getHeadRegardlessOfLane()!.toString();
    });

    describe('when all objects are present', () => {
      let parsedOutput: any;
      before(async () => {
        parsedOutput = await inDir(workspaceData.workspacePath, () => doctorCmd.json(['validate scope objects'], {}));
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
      let parsedOutput: any;
      before(async () => {
        // delete the head version object from the remote scope
        const hashPath = path.join(headHash.slice(0, 2), headHash.slice(2));
        await fs.remove(path.join(workspaceData.remoteScopePath, 'objects', hashPath));
        // a separate process would load the remote scope from the filesystem. drop the in-memory scope with its cached objects
        Scope.scopeCache = {};
        parsedOutput = await inDir(workspaceData.workspacePath, () =>
          doctorCmd.json(['validate scope objects'], { remote: workspaceData.remoteScopeName })
        );
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
