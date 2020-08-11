import R from 'ramda';
import _ from 'lodash';
import ConsumerOverrides from '../../consumer/config/consumer-overrides';
import { ExtensionDataList } from '../../consumer/config/extension-data';
import { PathLinuxRelative } from '../../utils/path';
import { pathIsInside, stripTrailingChar } from '../../utils';
import { EXT_NAME } from './constants';

export const MATCH_ALL_ITEM = '*';
const PATTERNS_DELIMITER = ',';

export type Patterns = { [pattern: string]: Record<string, any> };

export type VariantsComponentConfig = {
  propagate: boolean;
  exclude?: string[];
  defaultScope?: string;
  extensions: ExtensionDataList;
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

export class VariantsExtension {
  static id = EXT_NAME;
  static dependencies = [];

  componentsCache: Map<PathLinuxRelative, VariantsComponentConfig>;
  _loadedLegacy: ConsumerOverrides;

  constructor(private patterns: Patterns) {
    this.componentsCache = new Map<PathLinuxRelative, VariantsComponentConfig>();
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
   * Gets the config for specific component after merge all matching patterns of the component dir in the variants section
   * @param rootDir
   */
  byRootDir(rootDir: PathLinuxRelative): VariantsComponentConfig | undefined {
    if (this.componentsCache.has(rootDir)) {
      return this.componentsCache.get(rootDir);
    }

    const matches: MatchedPatternWithConfig[] = [];
    R.forEachObjIndexed((patternConfig, pattern) => {
      const match = isMatchPattern(rootDir, pattern);

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
    };
    // We cache this results since this is something with state (it has - hasChanged prop which should be consistent)
    this.componentsCache.set(rootDir, result);
    return result;
  }

  static async provider(_deps, config) {
    return new VariantsExtension(config);
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

export function isMatchPattern(rootDir: PathLinuxRelative, pattern: string): MatchedPattern {
  const patternItems = pattern.split(PATTERNS_DELIMITER);
  const matches = patternItems.map((item) => isMatchPatternItem(rootDir, item));
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

export function isMatchPatternItem(rootDir: PathLinuxRelative, patternItem: string): MatchedPatternItem {
  const patternItemTrimmed = patternItem.trim();
  // Special case for * (match all)
  // We want to mark it with match true but the smallest specificity
  if (patternItemTrimmed === MATCH_ALL_ITEM) {
    return {
      match: true,
      specificity: 0,
    };
  }
  // remove trailing / (will work for windows as well since the workspace.json always contain linux format)
  const patternItemStriped = stripTrailingChar(patternItemTrimmed, '/');
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
