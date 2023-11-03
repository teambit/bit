import { ComponentIssue, formatTitle } from './component-issue';

export class MissingDists extends ComponentIssue {
  description = 'missing dists';
  solution = 'run "bit compile"';
  data: boolean;
  isTagBlocker = false;
  outputForCLI() {
    return formatTitle(this.descriptionWithSolution, false);
  }
}
