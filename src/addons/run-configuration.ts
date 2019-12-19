import { PipeElementConfig } from './pipe';

export class RunConfiguration {
  protected constructor(public raw: RawConfiguration) {}
  validate() {
    return true;
  }
  toModel() {}
  fromRaw(raw: RawConfiguration) {
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

type BaseConfiguration = { [k: string]: PipeElementConfig };

export interface RawConfiguration extends baseConfiguration {
  runOptions?: {
    [k: string]: {
      bail: boolean;
      keep: boolean;
    };
  };
  aliases?: {
    [k: string]: string;
  };
}
