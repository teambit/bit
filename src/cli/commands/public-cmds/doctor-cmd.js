/** @flow */

import Command from '../../command';
import runAll, { listDiagnoses, runOne } from '../../../api/consumer/lib/doctor';
import type { DoctorRunAllResults, DoctorRunOneResult } from '../../../api/consumer/lib/doctor';
import formatDiagnosesList from '../../templates/diagnosis-list-template';
import formatDiagnosesResult from '../../templates/doctor-results-template';
import Diagnosis from '../../../doctor/diagnosis';

export default class Doctor extends Command {
  name = 'doctor [diagnosis-name]';
  description = 'diagnose a bit workspace';
  alias = '';
  opts = [
    ['j', 'json', 'return diagnoses in json format'],
    ['', 'list', 'list all available diagnoses'],
    ['s', 'save [filePath]', 'save diagnoses to a file']
  ];
  migration = false;

  action(
    [diagnosisName]: string[],
    {
      list = false,
      save
    }: {
      list?: boolean,
      save?: string
    }
  ): Promise<DoctorRunAllResults | Diagnosis[] | DoctorRunOneResult> {
    if (list) {
      return listDiagnoses();
    }
    let filePath = save;
    // Happen when used --save without specify the location
    if (save === true) {
      filePath = '.';
    }
    if (diagnosisName) {
      return runOne({ diagnosisName, filePath });
    }
    return runAll({ filePath });
  }

  report(res: DoctorRunAllResults | Diagnosis[], args: any, flags: Object): string {
    if (flags.list) {
      return _listReport(((res: any): Diagnosis[]), flags.json);
    }
    if (args && args[0]) {
      return _runOneReport(((res: any): DoctorRunOneResult), flags.json);
    }
    return _runAllReport(((res: any): DoctorRunAllResults), flags.json);
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
      examineResult
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
      examineResults
    };
    return JSON.stringify(fullJson, null, 2);
  }
  const formatted = formatDiagnosesResult({ examineResults, savedFilePath, metaData });
  return formatted;
}
