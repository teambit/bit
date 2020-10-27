import { Compilers, Testers } from 'bit-bin/dist/consumer/config/abstract-config';
import { ComponentOverridesData } from 'bit-bin/dist/consumer/config/component-overrides';
import { ExtensionDataList } from 'bit-bin/dist/consumer/config/extension-data';
import { PathLinux } from 'bit-bin/dist/utils/path';
// import { CustomResolvedPath } from 'bit-bin/dist/consumer/component/consumer-component';
// import { ComponentOverridesData } from 'bit-bin/dist/consumer/config/component-overrides';

type LegacyConfigProps = {
  lang?: string;
  compiler?: string | Compilers;
  tester?: string | Testers;
  bindingPrefix: string;
  extensions?: ExtensionDataList;
  overrides?: ComponentOverridesData;
};

/**
 * in-memory representation of the component configuration.
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
    readonly extensions: ExtensionDataList,

    readonly legacyProperties?: LegacyConfigProps
  ) {}
}
