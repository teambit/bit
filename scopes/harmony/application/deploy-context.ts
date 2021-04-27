import { BuildContext } from '@teambit/builder';

export interface DeployContext extends BuildContext {
  applicationType: string;

  aspectId: string;

  /* the build output */

  publicDir: string | null;
}
