import { BASE_DOCS_DOMAIN } from '@teambit/legacy/dist/constants';
import { ComponentIssue, ISSUE_FORMAT_SPACE } from './component-issue';

export class MultipleEnvs extends ComponentIssue {
  description = 'multiple envs';
  solution = `remove the old envs by setting them with "-" sign in the variants. see https://${BASE_DOCS_DOMAIN}envs/using-envs#component-must-have-a-single-env`;
  data: string[]; // env ids
  isTagBlocker = true;
  dataToString() {
    return ISSUE_FORMAT_SPACE + this.data.join(', ');
  }
}
