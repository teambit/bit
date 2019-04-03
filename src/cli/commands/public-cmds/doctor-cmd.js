/** @flow */

import chalk from 'chalk';
import Command from '../../command';
import runAll, { listDiagnoses } from '../../../api/consumer/lib/doctor';
import type { ExamineResult } from '../../../doctor/Diagnosis';
import formatDiagnosesList from '../../templates/diagnosis-list-template';
import Diagnosis from '../../../doctor/Diagnosis';

export default class Doctor extends Command {
  name = 'doctor';
  description = 'diagnose bit state';
  alias = '';
  commands = [new DoctorList()];
  opts = [];
  migration = false;

  action(): Promise<any> {
    return runAll();
  }

  report(res: ExamineResult[]): string {
    return chalk.green('run bit doctor', JSON.stringify(res));
  }
}

class DoctorList extends Command {
  name = 'list';
  description = 'list all registered diagnosis';
  alias = '';
  opts = [['j', 'json', 'return a json format']];

  async action({ json = false }: { json: boolean }): Promise<{ diagnosesList: Diagnosis[], json: boolean }> {
    const diagnosesList = await listDiagnoses();
    return {
      diagnosesList,
      json
    };
  }

  report(res): string {
    if (res.json) {
      return JSON.stringify(res.diagnosesList, null, 2);
    }
    // const formatted = res.map(diagnosis => `${diagnosis.name}   ${diagnosis.description}\n`);
    const formatted = formatDiagnosesList(res.diagnosesList);
    return formatted;
  }
}
