import { ComponentIssue, ISSUE_FORMAT_SPACE } from './component-issue';

export class MissingManuallyConfiguredPackages extends ComponentIssue {
  description = `missing packages that were manually set`;
  solution = `run "bit install"`;
  data: string[] = []; // package names
  dataToString() {
    return ISSUE_FORMAT_SPACE + this.data.join(', ');
  }
}
