import type { EnvHandler } from '@teambit/envs';
import type { AppTypeList } from './app-type-list';

export interface AppsEnv {
  /**
   * return a template list instance.
   */
  apps?(): EnvHandler<AppTypeList>;
}
