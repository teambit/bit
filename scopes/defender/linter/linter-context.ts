import type { ComponentMap } from '@teambit/component';
import type { ExecutionContext } from '@teambit/envs';

import type { FixTypes } from '@teambit/envs.contracts';

export type { EslintFixType, OxlintFixType, FixType, FixTypes } from '@teambit/envs.contracts';

export interface LinterOptions {
  /**
   * extensions formats to lint. (e.g. .ts, .tsx, etc.)
   */
  extensionFormats?: string[];

  /**
   * automatically fix problems
   */
  fix?: boolean;

  /**
   * specify the types of fixes to apply (problem, suggestion, layout)
   */
  fixTypes?: FixTypes;
}
export interface LinterContext extends ExecutionContext, LinterOptions {
  quiet?: boolean;
  /**
   * Root dir that contains all the components in the fs that are about to be linted
   * Usually it's the workspace root dir or the capsule root dir
   */
  rootDir?: string;

  /**
   * Component map with the path to the component in the fs
   */
  componentsDirMap: ComponentMap<string>;
}
