import { ComponentIssue, ISSUE_FORMAT_SPACE } from './component-issue';

export class RemovedEnv extends ComponentIssue {
  description = 'the env of this component is deleted';
  solution =
    'use "bit env set/replace" to set a new env or a different version of this env. to undo the delete, run "bit recover"';
  data: string; // env id
  isTagBlocker = true;
  dataToString() {
    return ISSUE_FORMAT_SPACE + this.data;
  }
}
