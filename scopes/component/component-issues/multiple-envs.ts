import { ComponentIssue, ISSUE_FORMAT_SPACE } from './component-issue';

export class MultipleEnvs extends ComponentIssue {
  description = 'multiple envs';
  solution =
    'set the desired env by running "bit env set <component> <env>", if it doesn\'t work, run "bit aspect unset <component> <unwanted-env-id>". to keep troubleshooting run "bit aspect list <component-id>"';
  data: string[]; // env ids
  isTagBlocker = true;
  dataToString() {
    return ISSUE_FORMAT_SPACE + this.data.join(', ');
  }
}
