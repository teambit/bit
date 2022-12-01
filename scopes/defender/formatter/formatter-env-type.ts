import { EnvHandler } from "@teambit/envs";
import { Formatter } from "./formatter";

export interface FormatterEnv {
  /**
   * return a Formatter instance.
   */
  formatter(): EnvHandler<Formatter>;
}
