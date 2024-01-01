import { ComponentIssue, formatTitle } from './component-issue';

export class MergeConfigHasConflict extends ComponentIssue {
  description = 'merge-conflict file has unresolved conflicts';
  solution = `edit the merge-conflict file in the workspace root and resolve the conflicts`;
  data: boolean;
  isTagBlocker = true;
  outputForCLI() {
    return formatTitle(this.descriptionWithSolution, false);
  }
}
