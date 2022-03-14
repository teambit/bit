import { ComponentIssue, ISSUE_FORMAT_SPACE } from './component-issue';
export class MultipleEnvs extends ComponentIssue {
  description = 'multiple envs';
  // TODO: pass the docs url into here after fetch it from the community aspect
  solution = `remove the old envs by setting them with "-" sign in the variants. see https://bit.dev/docs/envs/using-envs#component-must-have-a-single-env`;
  data: string[]; // env ids
  isTagBlocker = true;
  dataToString() {
    return ISSUE_FORMAT_SPACE + this.data.join(', ');
  }
}
