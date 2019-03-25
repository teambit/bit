/** @flow */

import chalk from 'chalk';
import Command from '../../command';
import runAll, { listChecks } from '../../../api/consumer/lib/doctor';

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

  report(res): string {
    return chalk.green('run bit doctor', res);
  }
}

class DoctorList extends Command {
  name = 'list';
  description = 'list all registered diagnosis';
  alias = '';
  opts = [];

  action(): Promise<any> {
    return listChecks();
  }

  report(res): string {
    return chalk.green('run bit doctor list', res);
  }
}
