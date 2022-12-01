import { EnvHandler } from "@teambit/envs";
import { TemplateList } from "./template-list";
import { StarterList } from "./starter-list";

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
