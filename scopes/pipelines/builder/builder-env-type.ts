import { EnvHandler } from "@teambit/envs";
import { Pipeline } from "./pipeline";

export interface BuilderEnv {
  /**
   * return a build pipeline instance.
   */
  build(): EnvHandler<Pipeline>;
  /**
   * return a snap pipeline instance.
   */
  snap(): EnvHandler<Pipeline>;
  /**
   * return a tag pipeline instance.
   */
  tag(): EnvHandler<Pipeline>;
}
