import { ComponentIssue, ISSUE_FORMAT_SPACE } from './component-issue';

export class DeprecatedDependencies extends ComponentIssue {
  description = 'dependencies used in the code were deprecated';
  solution = 'replace them with alternative dependencies. or remove them if not needed anymore';
  data: string[]; // deps ids
  isTagBlocker = false;
  dataToString() {
    return ISSUE_FORMAT_SPACE + this.data.join(', ');
  }
}
