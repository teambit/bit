import { PathLinux } from 'bit-bin/dist/utils/path';
import { ExtensionDataList } from 'bit-bin/dist/consumer/config/extension-data';
// import CompilerExtension from 'bit-bin/dist/legacy-extensions/compiler-extension';
// import TesterExtension from 'bit-bin/dist/legacy-extensions/tester-extension';
// import { CustomResolvedPath } from 'bit-bin/dist/consumer/component/consumer-component';
// import { ComponentOverridesData } from 'bit-bin/dist/consumer/config/component-overrides';

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
     * version main file for runtime (will be written into the main property in the package.json in the capsule)
     */
    // readonly runtimeMain: PathLinux,

    // readonly dependencies: DependenciesConfig,

    // readonly compiler?: CompilerExtension,

    // readonly tester?: TesterExtension,

    // bindingPrefix?: string,

    // customResolvedPaths?: CustomResolvedPath[],

    // overrides?: ComponentOverridesData,

    // packageJsonChangedProps,

    /**
     * configured extensions
     */
    readonly extensions: ExtensionDataList
  ) {}
}
