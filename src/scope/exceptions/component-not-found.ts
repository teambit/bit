import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export default class ComponentNotFound extends BitError {
  id: string;
  dependentId: string | null | undefined;
  code: number;

  constructor(id: string, dependentId?: string) {
    const baseMsg = dependentId
      ? `error: the component dependency "${chalk.bold(id)}" required by "${chalk.bold(dependentId)}" was not found`
      : `error: component "${chalk.bold(id)}" was not found`;
    super(`${baseMsg}\nconsider running "bit dependents ${id}" to understand why this component was needed`);
    this.code = 127;
    this.id = id;
    this.dependentId = dependentId;
  }
}
