import { ComponentIssue, formatTitle } from './component-issue';

export class LegacyInsideHarmony extends ComponentIssue {
  description = 'legacy component inside Harmony workspace';
  solution = 'remove the component and re-create it via Harmony';
  data: boolean;
  isTagBlocker = true;
  outputForCLI() {
    return formatTitle(this.descriptionWithSolution, false);
  }
}
