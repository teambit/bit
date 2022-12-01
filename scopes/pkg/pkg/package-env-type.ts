import { EnvHandler } from "@teambit/envs";
import { PackageGenerator } from "./package-generator";

export interface PackageEnv {
  /**
   * return a PackageGenerator instance.
   */
  package(): EnvHandler<PackageGenerator>;
}
