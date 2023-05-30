import { ComponentIssue, ISSUE_FORMAT_SPACE } from './component-issue';

type DataType = {
  envId: string;
  componentId: string;
};

export class ExternalEnvWithoutVersion extends ComponentIssue {
  description = 'failed loading env - external env without a version';
  data: DataType;
  solution = '';
  isTagBlocker = true;
  formatSolution(): string {
    return `(run "bit env set ${this.data.componentId} ${this.data.envId}")`;
  }
  dataToString() {
    return ISSUE_FORMAT_SPACE + this.data.envId;
  }
}
