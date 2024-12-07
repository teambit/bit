import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export default class ComponentOutOfSync extends BitError {
  id: string;
  showDoctorMessage: boolean;

  constructor(id: string) {
    super(`component ${chalk.bold(id)} is not in-sync between the consumer and the scope.
if it is originated from another git branch, go back to that branch to continue working on the component.
if possible, remove the component using "bit remove" and re-import or re-create it.
to re-start Bit from scratch, deleting all objects from the scope, use "bit init --reset-hard"`);
    this.id = id;
    this.showDoctorMessage = true;
  }
}
