import { ComponentIssue, ISSUE_FORMAT_SPACE } from './component-issue';

export class RemovedDependencies extends ComponentIssue {
  description = 'removed dependencies';
  solution = 'run "bit install <missing-dep>" or remove any unneeded references to that component from your code';
  data: string[]; // deps ids
  isTagBlocker = true;
  dataToString() {
    return ISSUE_FORMAT_SPACE + this.data.join(', ');
  }
}
