import { PipeElementConfig } from './pipe-element';
export interface PipeOptions {
  bail: boolean;
  keep: boolean;
}

export interface RunOptions extends PipeOptions {
  id?: string;
  step?: string;
  extensions: string[];
}

export class RunConfiguration {
  protected constructor(public raw: RawRunConfiguration) {}

  validate() {
    return true;
  }

  toModel() {
    return this.raw;
  }

  static fromRaw(raw: RawRunConfiguration) {
    debugger;
    const runConfig = new RunConfiguration(raw);
    if (runConfig.validate()) {
      return runConfig;
    }
    throw new Error('run configuration is not valid');
  }

  static fromModel(): RunConfiguration {
    return new RunConfiguration({});
  }
}
type GenericString = { [k: string]: string };
type GenericObject = { [k: string]: any };
type BaseConfiguration = { [k: string]: PipeElementConfig[] | GenericObject | undefined };

export interface RawRunConfiguration extends BaseConfiguration {
  runOptions?: PipeOptions;
  aliases?: GenericString;
}
