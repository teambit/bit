/** @flow */

import Command from '../../command';
import runAll, { listDiagnoses } from '../../../api/consumer/lib/doctor';
import type { DoctorRunAllResults } from '../../../api/consumer/lib/doctor';
import formatDiagnosesList from '../../templates/diagnosis-list-template';
import formatDiagnosesResult from '../../templates/doctor-results-template';
import Diagnosis from '../../../doctor/Diagnosis';

export default class Doctor extends Command {
  name = 'doctor';
  description = 'diagnose bit state';
  alias = '';
  commands = [new DoctorList()];
  opts = [['j', 'json', 'return a json format'], ['s', 'save [filePath]', 'save results to file']];
  migration = false;

  action(
    args: any,
    {
      json = false,
      save
    }: {
      json?: boolean,
      save?: string
    }
  ): Promise<DoctorRunAllResults> {
    let filePath = save;
    // Happen when used --save without specify the location
    if (save === true) {
      filePath = '.';
    }
    return runAll({ json, filePath });
  }

  report({ examineResults, savedFilePath }: DoctorRunAllResults, args: any, flags: Object): string {
    if (flags.json) {
      return JSON.stringify(examineResults, null, 2);
    }
    const formatted = formatDiagnosesResult({ examineResults, savedFilePath });
    return formatted;
  }
}

class DoctorList extends Command {
  name = 'list';
  description = 'list all registered diagnosis';
  alias = '';
  opts = [['j', 'json', 'return a json format']];

  async action(): Promise<Diagnosis[]> {
    return listDiagnoses();
  }

  report(res, args, flags): string {
    if (flags.json) {
      return JSON.stringify(res, null, 2);
    }
    // const formatted = res.map(diagnosis => `${diagnosis.name}   ${diagnosis.description}\n`);
    const formatted = formatDiagnosesList(res);
    return formatted;
  }
}
