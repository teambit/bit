import { BitId } from '@teambit/legacy-bit-id';
import { ComponentIssue } from './component-issue';

export class relativeComponents extends ComponentIssue {
  description = 'components with relative import statements found (use module paths for imported components)';
  data: { [filePath: string]: BitId[] } = {};
  isCacheBlocker: false;
}
