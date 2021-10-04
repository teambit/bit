import { ComponentIssue, ISSUE_FORMAT_SPACE } from './component-issue';

export class MultipleEnvs extends ComponentIssue {
  description = 'multiple envs';
  solution =
    'remove the old envs by setting them with "-" sign in the variants. see https://harmony-docs.bit.dev/aspects/variants#removing-aspects ';
  data: string[]; // env ids
  isTagBlocker = true;
  dataToString() {
    return ISSUE_FORMAT_SPACE + this.data.join(', ');
  }
}
