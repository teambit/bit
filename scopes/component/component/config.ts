import { Compilers, Testers } from '@teambit/legacy/dist/consumer/config/abstract-config';
import { ComponentOverridesData } from '@teambit/legacy/dist/consumer/config/component-overrides';
import { ExtensionDataList } from '@teambit/legacy/dist/consumer/config/extension-data';
import { PathLinux } from '@teambit/legacy/dist/utils/path';
// import { CustomResolvedPath } from '@teambit/legacy/dist/consumer/component/consumer-component';
// import { ComponentOverridesData } from '@teambit/legacy/dist/consumer/config/component-overrides';

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
