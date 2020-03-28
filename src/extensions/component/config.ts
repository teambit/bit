import { PathLinux } from '../../utils/path';
// import CompilerExtension from '../../legacy-extensions/compiler-extension';
// import TesterExtension from '../../legacy-extensions/tester-extension';
// import { CustomResolvedPath } from '../../consumer/component/consumer-component';
// import { ComponentOverridesData } from '../../consumer/config/component-overrides';

export type ExtensionConfig = { [name: string]: any };

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
    readonly extensions: ExtensionConfig
  ) {}
}
