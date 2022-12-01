import { EnvHandler } from "."

export interface Env {
  [key: string]: EnvHandler<unknown> | any;
}
