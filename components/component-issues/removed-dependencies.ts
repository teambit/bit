import { ComponentIssue, ISSUE_FORMAT_SPACE } from './component-issue';

export class RemovedDependencies extends ComponentIssue {
  description = 'removed dependencies';
  solution =
    'either "bit install" another version of the dependency that was not removed or edit the code to remove references to the dependency.';
  data: string[]; // deps ids
  isTagBlocker = true;
  dataToString() {
    return ISSUE_FORMAT_SPACE + this.data.join(', ');
  }
}
