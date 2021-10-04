import { ComponentIssue, formatTitle } from './component-issue';

export class MissingLinksFromNodeModulesToSrc extends ComponentIssue {
  description = 'missing links from node_modules to source';
  solution = 'run "bit link"';
  data: boolean;
  isTagBlocker = false;
  outputForCLI() {
    return formatTitle(this.descriptionWithSolution, false);
  }
}
