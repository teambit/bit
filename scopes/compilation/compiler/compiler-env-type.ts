import { EnvHandler } from "@teambit/envs";
import { Compiler } from "./types";

export interface CompilerEnv {
  /**
   * return a compiler instance.
   */
  compiler(): EnvHandler<Compiler>;
}
