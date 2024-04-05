import { ComponentIssue, ISSUE_FORMAT_SPACE } from './component-issue';

export class RemovedDependencies extends ComponentIssue {
  description = 'dependencies used in the code were deleted';
  solution =
    'if the dependencies are no longer needed, remove them from the code. otherwise, to get it installed from main run "bit install <missing dep>". to undo the delete, run "bit recover"';
  data: string[]; // deps ids
  isTagBlocker = true;
  dataToString() {
    return ISSUE_FORMAT_SPACE + this.data.join(', ');
  }
}
