import { EnvHandler } from "@teambit/envs";
import { Linter } from "./linter";

export interface LinterEnv {
  /**
   * return a Linter instance.
   */
  linter(): EnvHandler<Linter>;
}
