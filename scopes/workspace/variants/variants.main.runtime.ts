import { MainRuntime } from '@teambit/cli';
import ConsumerOverrides from '@teambit/legacy/dist/consumer/config/consumer-overrides';
import { ExtensionDataList } from '@teambit/legacy/dist/consumer/config/extension-data';
import { PathLinuxRelative } from '@teambit/legacy/dist/utils/path';
import { forEachObjIndexed, omit } from 'ramda';
import {
  MatchedPatternWithConfig,
  isMatchPattern,
  sortMatchesBySpecificity,
} from '@teambit/workspace.modules.match-pattern';
import { InvalidScopeName, isValidScopeName } from '@teambit/legacy-bit-id';
import { VariantsAspect } from './variants.aspect';

export type Patterns = { [pattern: string]: Record<string, any> };

export type VariantsComponentConfig = {
  propagate: boolean;
  exclude?: string[];
  defaultScope?: string;
  extensions: ExtensionDataList;
  maxSpecificity: number;
};

const INTERNAL_FIELDS = ['propagate', 'exclude', 'defaultScope'];

export class VariantsMain {
  static runtime = MainRuntime;
  static dependencies = [];

  _loadedLegacy: ConsumerOverrides;

  constructor(private patterns: Patterns) {
    this._loadedLegacy = ConsumerOverrides.load(this.patterns);
    this.validateConfig();
  }

  private validateConfig() {
    forEachObjIndexed((patternConfig: Record<string, any>, pattern: string) => {
      if (patternConfig.defaultScope && !isValidScopeName(patternConfig.defaultScope)) {
        throw new InvalidScopeName(patternConfig.defaultScope, undefined, pattern);
      }
    }, this.patterns);
  }

  raw(): Patterns {
    return this.patterns;
  }

  /**
   * Get all the patterns defined in the variants section of the workspace as the legacy ConsumerOverrides format
   */
  legacy(): ConsumerOverrides {
    // return ConsumerOverrides.load(this.patterns);
    return this._loadedLegacy;
  }

  /**
   * Gets the config for specific component after merge all matching patterns of the component dir and id in the variants section
   * @param rootDir
   */
  byRootDirAndName(rootDir: PathLinuxRelative, componentName: string): VariantsComponentConfig | undefined {
    const matches: MatchedPatternWithConfig[] = [];
    forEachObjIndexed((patternConfig, pattern) => {
      const match = isMatchPattern(rootDir, componentName, pattern);

      // Ignore matches with exclude matches
      if (match.match && !match.excluded) {
        matches.push({
          config: patternConfig,
          specificity: match.maxSpecificity,
        });
      }
    }, this.patterns);

    const sortedMatches: MatchedPatternWithConfig[] = sortMatchesBySpecificity(matches);

    let defaultScope;
    let propagate = true;
    const extensionsToMerge: ExtensionDataList[] = [];
    sortedMatches.forEach((match) => {
      defaultScope = defaultScope || match.config.defaultScope;
      if (propagate) {
        extensionsToMerge.push(getExtensionFromPatternRawConfig(match.config));
      }
      if (match.config.propagate === false) {
        propagate = false;
      }
    });

    const mergedExtensions = ExtensionDataList.mergeConfigs(extensionsToMerge);
    const result = {
      defaultScope,
      extensions: mergedExtensions,
      propagate,
      maxSpecificity: sortedMatches.length ? sortedMatches[0].specificity : -1,
    };
    return result;
  }

  static async provider(_deps, config) {
    return new VariantsMain(config);
  }
}

function getExtensionFromPatternRawConfig(config: Record<string, any>) {
  const rawExtensions = omit(INTERNAL_FIELDS, config);
  const extensions = ExtensionDataList.fromConfigObject(rawExtensions);
  return extensions;
}

VariantsAspect.addRuntime(VariantsMain);
