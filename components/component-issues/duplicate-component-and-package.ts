import { ComponentIssue, ISSUE_FORMAT_SPACE } from './component-issue';

export class DuplicateComponentAndPackage extends ComponentIssue {
  description = 'tracked component added as a package';
  solution = 'either remove the package from the workspace.jsonc (bit uninstall) or remove the component (bit remove)';
  data: string;
  isTagBlocker = true;
  dataToString() {
    return ISSUE_FORMAT_SPACE + this.data;
  }
}
