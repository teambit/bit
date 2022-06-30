import { ComponentIssue, StringsPerFilePath } from './component-issue';

export class MissingCustomModuleResolutionLinks extends ComponentIssue {
  isLegacyIssue = true;
  description = 'missing links';
  solution = 'use "bit link" to build missing component links';
  data: StringsPerFilePath = {};
}
