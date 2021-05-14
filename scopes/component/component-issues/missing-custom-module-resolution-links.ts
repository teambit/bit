import { ComponentIssue, StringsPerFilePath } from './component-issue';

export class MissingCustomModuleResolutionLinks extends ComponentIssue {
  description = 'missing links (use "bit link" to build missing component links)';
  data: StringsPerFilePath = {};
}
