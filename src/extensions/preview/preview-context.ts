import { BuildContext } from '../builder';

export interface PreviewContext extends BuildContext {
  entries: string[];
}
