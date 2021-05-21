import runAll, {
  DoctorRunAllResults,
  DoctorRunOneResult,
  listDiagnoses,
  runOne,
} from '../../../api/consumer/lib/doctor';
import Diagnosis from '../../../doctor/diagnosis';
import { Group } from '../../command-groups';
import { CommandOptions, LegacyCommand } from '../../legacy-command';
import formatDiagnosesList from '../../templates/diagnosis-list-template';
import formatDiagnosesResult from '../../templates/doctor-results-template';

export default class Doctor implements LegacyCommand {
  name = 'doctor [diagnosis-name]';
  description = 'diagnose a bit workspace';
  group: Group = 'general';
  alias = '';
  opts = [
    ['j', 'json', 'return diagnoses in json format'],
    ['', 'list', 'list all available diagnoses'],
    ['s', 'save [filePath]', 'save diagnoses to a file'],
  ] as CommandOptions;
  migration = false;

  action(
    [diagnosisName]: string[],
    {
      list = false,
      save,
    }: {
      list?: boolean;
      save?: string;
    }
  ): Promise<DoctorRunAllResults | Diagnosis[] | DoctorRunOneResult> {
    if (list) {
      return listDiagnoses();
    }
    let filePath = save;
    // Happen when used --save without specify the location
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (save === true) {
      filePath = '.';
    }
    if (diagnosisName) {
      return runOne({ diagnosisName, filePath });
    }
    return runAll({ filePath });
  }

  report(res: DoctorRunAllResults | Diagnosis[], args: any, flags: Record<string, any>): string {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (flags.list) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return _listReport(res, flags.json);
    }
    if (args && args[0]) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return _runOneReport(res, flags.json);
    }
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return _runAllReport(res, flags.json);
  }
}

function _listReport(res: Diagnosis[], json: boolean): string {
  if (json) {
    return JSON.stringify(res, null, 2);
  }
  // const formatted = res.map(diagnosis => `${diagnosis.name}   ${diagnosis.description}\n`);
  const formatted = formatDiagnosesList(res);
  return formatted;
}

function _runOneReport(res: DoctorRunOneResult, json: boolean): string {
  const { examineResult, savedFilePath, metaData } = res;
  if (json) {
    const fullJson = {
      savedFilePath,
      examineResult,
    };
    return JSON.stringify(fullJson, null, 2);
  }
  const formatted = formatDiagnosesResult({ examineResults: [examineResult], savedFilePath, metaData });
  return formatted;
}

function _runAllReport(res: DoctorRunAllResults, json: boolean): string {
  const { examineResults, savedFilePath, metaData } = res;
  if (json) {
    const fullJson = {
      savedFilePath,
      examineResults,
    };
    return JSON.stringify(fullJson, null, 2);
  }
  const formatted = formatDiagnosesResult({ examineResults, savedFilePath, metaData });
  return formatted;
}
