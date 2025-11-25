import type { EnvHandler } from '@teambit/envs';
import type { TemplateList } from './template-list';
import type { StarterList } from './starter-list';

export interface GeneratorEnv {
  /**
   * return a template list instance.
   */
  generators(): EnvHandler<TemplateList>;
  /**
   * return a starter list instance.
   */
  starters(): EnvHandler<StarterList>;
}
