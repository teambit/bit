import { ComponentIssue, ISSUE_FORMAT_SPACE } from './component-issue';

export class PinnedDependencies extends ComponentIssue {
  description = 'dependencies with a version set in the component config (e.g. "bit deps set"), not by the workspace';
  solution =
    'if the version is not needed in the component config, run "bit deps unset <component> <package>". to change the version for the workspace, run "bit install <package>@<version>"';
  data: string[] = []; // package@version
  isTagBlocker = false;
  dataToString() {
    return ISSUE_FORMAT_SPACE + this.data.join(', ');
  }
}
