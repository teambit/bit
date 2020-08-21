import { BuildContext } from '@teambit/builder';

export interface PreviewContext extends BuildContext {
  entries: string[];
}
