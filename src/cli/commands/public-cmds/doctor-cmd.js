/** @flow */

import chalk from 'chalk';
import Command from '../../command';
import runAll, { listDiagnoses } from '../../../api/consumer/lib/doctor';
import type { ExamineResult } from '../../../doctor/Diagnosis';

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
  opts = [];

  action(): Promise<any> {
    return listDiagnoses();
  }

  report(res): string {
    const formatted = res.map(diagnosis => `${diagnosis.name}   ${diagnosis.description}\n`);
    return chalk.green(formatted);
  }
}
