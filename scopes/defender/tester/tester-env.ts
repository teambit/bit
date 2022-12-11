import { EnvHandler } from "@teambit/envs";
import { Tester } from "./tester";

export interface TesterEnv {
  tester(): EnvHandler<Tester>;
}
