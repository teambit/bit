import { BuildContext } from '@teambit/builder';

export interface DeployContext extends BuildContext {
  /* the build output */

  publicDir: string | null;
}
