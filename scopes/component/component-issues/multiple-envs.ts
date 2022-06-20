import { ComponentIssue, ISSUE_FORMAT_SPACE } from './component-issue';

export class MultipleEnvs extends ComponentIssue {
  description = 'multiple envs';
  solution = 'set the desired env by running "bit env set <component> <env>"';
  data: string[]; // env ids
  isTagBlocker = true;
  dataToString() {
    return ISSUE_FORMAT_SPACE + this.data.join(', ');
  }
}
