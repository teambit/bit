import { ComponentIssue } from './component-issue';

export class CustomModuleResolutionUsed extends ComponentIssue {
  description = 'component is using an unsupported resolve-modules (aka aliases) feature, replace to module paths';
  data: { [filePath: string]: string[] } = {};
  isCacheBlocker: false;
}
