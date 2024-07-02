import { MainRuntime } from '@teambit/cli';
import { ConfigAspect } from '@teambit/config';
import type { ConfigMain } from '@teambit/config';
import { ExtensionDataList } from '@teambit/legacy/dist/consumer/config/extension-data';
import { PathLinuxRelative } from '@teambit/legacy.utils';
import { assign } from 'comment-json';
import { omit, forEach } from 'lodash';
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
  sortedMatches: MatchedPatternWithConfig[];
};

const INTERNAL_FIELDS = ['propagate', 'exclude', 'defaultScope'];

export class VariantsMain {
  static runtime = MainRuntime;
  static dependencies = [ConfigAspect];

  constructor(private patterns: Patterns, private configAspect: ConfigMain) {
    this.validateConfig();
  }

  private validateConfig() {
    forEach(this.patterns, (patternConfig: Record<string, any>, pattern: string) => {
      if (patternConfig.defaultScope && !isValidScopeName(patternConfig.defaultScope)) {
        throw new InvalidScopeName(patternConfig.defaultScope, undefined, pattern);
      }
    });
  }

  raw(): Patterns {
    return this.patterns;
  }

  /**
   * Gets the config for specific component after merge all matching patterns of the component dir and id in the variants section
   * @param rootDir
   */
  byRootDirAndName(rootDir: PathLinuxRelative, componentName: string): VariantsComponentConfig | undefined {
    const matches: MatchedPatternWithConfig[] = [];
    forEach(this.patterns, (patternConfig, pattern) => {
      const match = isMatchPattern(rootDir, componentName, pattern);

      // Ignore matches with exclude matches
      if (match.match && !match.excluded) {
        matches.push({
          config: patternConfig,
          specificity: match.maxSpecificity,
          pattern: match.pattern,
        });
      }
    });

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
      sortedMatches,
    };
    return result;
  }

  /**
   * Updates the specified extension object of the specified variant.
   * @param {string} variant - The variant pattern.
   * @param {string} extensionId - The extension ID.
   * @param {Object} extensionConfig - The extension configuration.
   * @param {boolean} opts.overrideExisting - When true, any existing entries are overriden.
   */
  setExtension(variant: string, extensionId: string, extensionConfig: any, opts?: { overrideExisting?: boolean }) {
    const newVariant = this.patterns[variant] ?? {};
    assign(newVariant, { [extensionId]: extensionConfig });
    assign(this.patterns, { [variant]: newVariant });
    this.configAspect.setExtension(VariantsAspect.id, this.patterns, {
      overrideExisting: opts?.overrideExisting === true,
      ignoreVersion: true,
    });
  }

  static async provider([configAspect]: [ConfigMain], config) {
    return new VariantsMain(config, configAspect);
  }
}

function getExtensionFromPatternRawConfig(config: Record<string, any>) {
  const rawExtensions = omit(config, INTERNAL_FIELDS);
  const extensions = ExtensionDataList.fromConfigObject(rawExtensions);
  return extensions;
}

VariantsAspect.addRuntime(VariantsMain);
