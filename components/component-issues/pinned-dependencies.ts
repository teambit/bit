import { ComponentIssue, ISSUE_FORMAT_SPACE } from './component-issue';

export class PinnedDependencies extends ComponentIssue {
  description =
    'dependencies on workspace components with a version set in the config (e.g. "bit deps set"), not the workspace version';
  solution = 'to use the workspace version, run "bit deps unset <component> <package>"';
  data: string[] = []; // package@version
  isTagBlocker = false;
  dataToString() {
    return ISSUE_FORMAT_SPACE + this.data.join(', ');
  }
}
