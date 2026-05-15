import type { Command, CommandOptions } from '@teambit/cli';
import formatDiagnosesList from './diagnosis-list-template';
import formatDiagnosesResult from './doctor-results-template';
import type { DoctorMain, DoctorOptions } from './doctor.main.runtime';
import { doctorCommand } from './doctor.commands';

type Flags = {
  list?: boolean;
  save?: string;
  archive?: string;
  includeNodeModules?: boolean;
  includePublic?: boolean;
  excludeLocalScope?: boolean;
  remote?: string;
};

export class DoctorCmd implements Command {
  name = doctorCommand.name;
  description = doctorCommand.description;
  extendedDescription = doctorCommand.extendedDescription;
  group = doctorCommand.group;
  alias = doctorCommand.alias;
  loadAspects = doctorCommand.loadAspects;
  options = doctorCommand.options;

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
      remote,
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
      remote,
    };
    return diagnosisName ? this.doctor.runOne(doctorOptions) : this.doctor.runAll(doctorOptions);
  }
}
