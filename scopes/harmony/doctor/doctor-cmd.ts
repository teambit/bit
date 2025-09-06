import type { Command, CommandOptions } from '@teambit/cli';
import formatDiagnosesList from './diagnosis-list-template';
import formatDiagnosesResult from './doctor-results-template';
import type { DoctorMain, DoctorOptions } from './doctor.main.runtime';

type Flags = {
  list?: boolean;
  save?: string;
  archive?: string;
  includeNodeModules?: boolean;
  includePublic?: boolean;
  excludeLocalScope?: boolean;
};

export class DoctorCmd implements Command {
  name = 'doctor [diagnosis-name]';
  description = 'diagnose and troubleshoot workspace issues';
  extendedDescription = `runs comprehensive health checks on your workspace to detect and report configuration problems, 
missing dependencies, corrupted data, and other issues that may affect workspace functionality.
can generate diagnostic reports and workspace archives for debugging and support purposes.`;
  group = 'system';
  alias = '';
  loadAspects = false;
  options = [
    ['j', 'json', 'return diagnoses in json format'],
    ['', 'list', 'list all available diagnoses'],
    ['s', 'save [filePath]', 'save diagnoses to a file'],
    [
      'a',
      'archive [filePath]',
      'archive the workspace including diagnosis info (by default exclude node-modules and include .bit)',
    ],
    ['n', 'include-node-modules', 'relevant for --archive. include node_modules in the archive file'],
    ['p', 'include-public', 'relevant for --archive. include public folder in the archive file'],
    ['e', 'exclude-local-scope', 'relevant for --archive. exclude .bit or .git/bit from the archive file'],
  ] as CommandOptions;

  constructor(private doctor: DoctorMain) {}

  async report([diagnosisName]: string[], flags: Flags) {
    const res = await this.runDiag(diagnosisName, flags);
    if (flags.list) {
      return formatDiagnosesList(res);
    }
    if (diagnosisName) {
      const { examineResult, savedFilePath, metaData } = res;
      return formatDiagnosesResult({ examineResults: [examineResult], savedFilePath, metaData });
    }
    const { examineResults, savedFilePath, metaData } = res;
    return formatDiagnosesResult({ examineResults, savedFilePath, metaData });
  }

  async json([diagnosisName]: string[], flags: Flags) {
    const res = await this.runDiag(diagnosisName, flags);
    if (flags.list) {
      return res;
    }
    const { examineResults, examineResult, savedFilePath } = res;
    const fullJson = {
      savedFilePath,
      examineResult,
      examineResults,
    };
    return fullJson;
  }

  private async runDiag(diagnosisName?: string, flags: Flags = {}): Promise<any> {
    const {
      list = false,
      save,
      archive,
      includeNodeModules = false,
      includePublic = false,
      excludeLocalScope = false,
    } = flags;

    if (list) {
      return this.doctor.listDiagnoses();
    }
    if ((includeNodeModules || excludeLocalScope) && !archive) {
      throw new Error('to use --include-node-modules or --exclude-local-scope please specify --archive');
    }
    let filePath = save;
    // Happen when used --save without specify the location
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (save === true || archive === true) {
      filePath = '.';
    }
    if (typeof archive === 'string') {
      filePath = archive;
    }
    const doctorOptions: DoctorOptions = {
      diagnosisName,
      filePath,
      archiveWorkspace: Boolean(archive),
      includeNodeModules,
      includePublic,
      excludeLocalScope,
    };
    return diagnosisName ? this.doctor.runOne(doctorOptions) : this.doctor.runAll(doctorOptions);
  }
}
