import { ComponentIssue, ISSUE_FORMAT_SPACE } from './component-issue';

export class NonLoadedEnv extends ComponentIssue {
  description = 'failed loading env';
  solution = `run "bit install"`;
  data: string;
  isTagBlocker = true;
  dataToString() {
    return ISSUE_FORMAT_SPACE + this.data;
  }
}
