import { PathLinux } from '../../utils/path';

/**
 * in-memory represnentation of the component configuration.
 */
export default class Config {
  constructor(
    /**
     * version main file
     */
    readonly main: PathLinux,

    /**
     * configured extensions
     */
    readonly extensions: ExtensionConfig
  ) {}
}

export type ExtensionConfig = { [name: string]: any };
