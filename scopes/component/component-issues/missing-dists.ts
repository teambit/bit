import { ComponentIssue, formatTitle } from './component-issue';

export class MissingDists extends ComponentIssue {
  description = 'missing dists (run "bit compile")';
  data: boolean;
  isTagBlocker = false;
  outputForCLI() {
    return formatTitle(this.description, false);
  }
}
