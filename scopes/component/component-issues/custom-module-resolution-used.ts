import { ComponentIssue, StringsPerFilePath } from './component-issue';

export class CustomModuleResolutionUsed extends ComponentIssue {
  description = 'component is using an unsupported resolve-modules (aka aliases) feature';
  solution = 'replace to module paths';
  data: StringsPerFilePath = {};
}
