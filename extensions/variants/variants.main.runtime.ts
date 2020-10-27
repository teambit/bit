import { MainRuntime } from '@teambit/cli';
import ConsumerOverrides from 'bit-bin/dist/consumer/config/consumer-overrides';
import { ExtensionDataList } from 'bit-bin/dist/consumer/config/extension-data';
import { pathIsInside, stripTrailingChar } from 'bit-bin/dist/utils';
import { PathLinuxRelative } from 'bit-bin/dist/utils/path';
import _ from 'lodash';
import R from 'ramda';

import { VariantsAspect } from './variants.aspect';

export const MATCH_ALL_ITEM = '*';
const PATTERNS_DELIMITER = ',';

export type Patterns = { [pattern: string]: Record<string, any> };

export type VariantsComponentConfig = {
  propagate: boolean;
  exclude?: string[];
  defaultScope?: string;
  extensions: ExtensionDataList;
  maxSpecificity: number;
};

type MatchedPattern = {
  // Boolean to indicate if it's matching or no
  match: boolean;
  // How many levels (max) it is match
  // it called max for example for this case:
  // pattern - utils, utils/string, utils/string/is-string
  // rootDir - utils/string/is-string
  // This match all sub patters, but the max is utils/string/is-string which is 3
  maxSpecificity: number;
};

type MatchedPatternWithConfig = {
  config: Record<string, any>;
  specificity: number;
};

type MatchedPatternItem = {
  // Boolean to indicate if it's matching or no
  match: boolean;
  specificity: number;
};

const INTERNAL_FIELDS = ['propagate', 'exclude', 'defaultScope'];

export class VariantsMain {
  static runtime = MainRuntime;
  static dependencies = [];

  _loadedLegacy: ConsumerOverrides;

  constructor(private patterns: Patterns) {
    this._loadedLegacy = ConsumerOverrides.load(this.patterns);
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
    R.forEachObjIndexed((patternConfig, pattern) => {
      const match = isMatchPattern(rootDir, componentName, pattern);

      if (match.match) {
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
  const rawExtensions = R.omit(INTERNAL_FIELDS, config);
  const extensions = ExtensionDataList.fromConfigObject(rawExtensions);
  return extensions;
}

export function sortMatchesBySpecificity(matches: MatchedPatternWithConfig[]) {
  const sortedMatches: MatchedPatternWithConfig[] = R.sortBy(R.prop('specificity'), matches).reverse();
  return sortedMatches;
}

export function isMatchPattern(rootDir: PathLinuxRelative, componentName: string, pattern: string): MatchedPattern {
  const patternItems = pattern.split(PATTERNS_DELIMITER);
  const matches = patternItems.map((item) => isMatchPatternItem(rootDir, componentName, item));
  const defaultVal: MatchedPatternItem = {
    match: false,
    specificity: -1,
  };

  const maxMatch: MatchedPatternItem = _.maxBy(matches, (match) => match.specificity) || defaultVal;
  return {
    match: maxMatch.match,
    maxSpecificity: maxMatch.specificity,
  };
}

export function isMatchPatternItem(
  rootDir: PathLinuxRelative,
  componentName: string,
  patternItem: string
): MatchedPatternItem {
  const patternItemTrimmed = patternItem.trim();
  // Special case for * (match all)
  // We want to mark it with match true but the smallest specificity
  if (patternItemTrimmed === MATCH_ALL_ITEM) {
    return {
      match: true,
      specificity: 0,
    };
  }
  if (isDirItem(patternItem)) {
    return isMatchDirPatternItem(rootDir, patternItem);
  }
  return isMatchNamespacePatternItem(componentName, patternItem);
}

export function isMatchDirPatternItem(rootDir: PathLinuxRelative, patternItem: string): MatchedPatternItem {
  // remove trailing / (will work for windows as well since the workspace.json always contain linux format)
  const patternItemStriped = stripTrailingChar(patternItem, '/').trim();

  if (pathIsInside(rootDir, patternItemStriped)) {
    return {
      match: true,
      specificity: patternItemStriped.split('/').length,
    };
  }
  return {
    match: false,
    specificity: -1,
  };
}

export function isMatchNamespacePatternItem(componentName: string, patternItem: string): MatchedPatternItem {
  // remove trailing / (will work for windows as well since the workspace.json always contain linux format)
  const withoutBrackets = patternItem.replace('{', '').replace('}', '').trim();
  const patternItemStriped = stripTrailingChar(withoutBrackets, '/').trim();

  let match = true;
  let specificity = 0;
  const splittedComp = componentName.split('/');
  const splittedPattern = patternItemStriped.split('/');
  if (splittedPattern.length > splittedComp.length) {
    return {
      match: false,
      specificity: -1,
    };
  }

  if (splittedPattern.length < splittedComp.length && splittedPattern[splittedPattern.length - 1] !== '*') {
    return {
      match: false,
      specificity: -1,
    };
  }

  splittedPattern.forEach((patternElement, index) => {
    const componentElement = splittedComp[index];
    if (patternElement === '*') {
      specificity += index / 10;
      return;
    }
    if (patternElement === componentElement) {
      specificity += 1;
      return;
    }
    match = false;
  });

  return {
    match,
    specificity: match ? specificity : -1,
  };
}

function isDirItem(patternItem: string) {
  return !patternItem.startsWith('{');
}

VariantsAspect.addRuntime(VariantsMain);
