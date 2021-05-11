import { BitId } from '@teambit/legacy-bit-id';
import { ComponentIssue } from './component-issue';

export class MissingLinks extends ComponentIssue {
  description = 'missing links between components(use "bit link" to build missing component links)';
  data: { [filePath: string]: BitId[] } = {};
}
