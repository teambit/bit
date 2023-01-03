import { EnvHandler } from "@teambit/envs";
import { AppTypeList } from "./app-type-list";

export interface AppsEnv {
  /**
   * return a template list instance.
   */
  apps(): EnvHandler<AppTypeList>;
}
