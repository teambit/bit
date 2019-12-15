import { Extension } from './extension';

type BaseConfig = { [k: string]: string[] | RunOptions | Aliases | undefined };

export type RunOptions = {
  [k: string]: {
    applyTo: string[];
    bail: boolean;
  };
};

type Aliases = { [k: string]: Extension };

export interface RawConfig extends BaseConfig {
  runOptions?: RunOptions;
  aliases?: Aliases;
}

export type ConfigFactory = () => RawConfig;

export class Config {
  constructor(public config: RawConfig) {}
  public pipes() {}
  public validate() {}
}
