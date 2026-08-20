import { ComponentIssue, formatTitle } from './component-issue';

export class CircularDependencies extends ComponentIssue {
  description = 'circular dependencies';
  solution = 'run `bit deps circular` to get the component-ids participating in the circular';
  data: boolean;
  isTagBlocker = true;
  outputForCLI() {
    return formatTitle(this.descriptionWithSolution, false);
  }
}
