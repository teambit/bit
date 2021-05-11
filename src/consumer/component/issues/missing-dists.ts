import { ComponentIssue, formatTitle } from './component-issue';

export class MissingDists extends ComponentIssue {
  description = 'missing components (use "bit import" or `bit install` to make sure all components exist)';
  data: boolean;
  isTagBlocker = false;
  format() {
    return formatTitle(this.description, false);
  }
}
