import { ExtensionDataList } from '../../consumer/config/extension-data';
import { Compilers, Testers } from '../../consumer/config/abstract-config';
import { ComponentOverridesData } from '../../consumer/config/component-overrides';
// import CompilerExtension from '../../legacy-extensions/compiler-extension';
// import TesterExtension from '../../legacy-extensions/tester-extension';
// import { CustomResolvedPath } from '../../consumer/component/consumer-component';
// import { ComponentOverridesData } from '../../consumer/config/component-overrides';

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
     * configured extensions
     */
    readonly extensions: ExtensionDataList,

    readonly legacyProperties?: LegacyConfigProps
  ) {}
}
