import { EnvHandler } from "@teambit/envs";
import { TemplateList } from "./template-list";

export interface GeneratorEnv {
  /**
   * return a template list instance.
   */
  generators(): EnvHandler<TemplateList>;
  /**
   * TODO: complete this interface.
   */
  // starters(): EnvHandler<TemplateList>;
}
