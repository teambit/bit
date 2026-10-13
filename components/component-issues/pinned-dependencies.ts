import { ComponentIssue, ISSUE_FORMAT_SPACE } from './component-issue';

export class PinnedDependencies extends ComponentIssue {
  description =
    'dependencies on workspace components with a version set by config ("bit deps set", variants or env), not the workspace version';
  solution =
    'to use the workspace version, remove the version from the config, e.g. "bit deps unset <component> <package>"';
  data: string[] = []; // package@version
  isTagBlocker = false;
  dataToString() {
    return ISSUE_FORMAT_SPACE + this.data.join(', ');
  }
}
