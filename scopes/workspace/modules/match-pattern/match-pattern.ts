import { stripTrailingChar } from '@teambit/string.strip-trailing-char';
import { isPathInside } from '@teambit/path.is-path-inside';
import { sortBy, prop, any } from 'ramda';
import _ from 'lodash';

export const PATTERNS_DELIMITER = ',';
export const MATCH_ALL_ITEM = '*';
export const EXCLUSION_SIGN = '!';

export type PathLinuxRelative = string;

export type MatchedPattern = {
  // Boolean to indicate if it's matching or no
  match: boolean;
  // Check if at least one of the items in the pattern excluding the component
  excluded: boolean;
  // How many levels (max) it is match
  // it called max for example for this case:
  // pattern - utils, utils/string, utils/string/is-string
  // rootDir - utils/string/is-string
  // This match all sub patters, but the max is utils/string/is-string which is 3
  maxSpecificity: number;
};

export type MatchedPatternWithConfig = {
  config: Record<string, any>;
  specificity: number;
};

export type MatchedPatternItem = {
  // Boolean to indicate if it's matching or no
  match: boolean;
  specificity: number;
};

export type MatchedPatternItemWithExclude = MatchedPatternItem & {
  // Check if the item is excluding the component
  excluded: boolean;
};

export function sortMatchesBySpecificity(matches: MatchedPatternWithConfig[]) {
  const sortedMatches: MatchedPatternWithConfig[] = sortBy(prop('specificity'), matches).reverse();
  return sortedMatches;
}

export function isMatchPattern(rootDir: PathLinuxRelative, componentName: string, pattern: string): MatchedPattern {
  const patternItems = pattern.split(PATTERNS_DELIMITER);
  const matches = patternItems.map((item) => isMatchPatternItem(rootDir, componentName, item));
  const defaultVal: MatchedPatternItemWithExclude = {
    match: false,
    excluded: false,
    specificity: -1,
  };

  const maxMatch: MatchedPatternItemWithExclude = _.maxBy(matches, (match) => match.specificity) || defaultVal;
  const excluded = any((match) => match.excluded, matches);
  return {
    match: maxMatch.match,
    maxSpecificity: maxMatch.specificity,
    excluded,
  };
}

export function isMatchPatternItem(
  rootDir: PathLinuxRelative,
  componentName: string,
  patternItem: string
): MatchedPatternItemWithExclude {
  const patternItemTrimmed = patternItem.trim();
  // Special case for * (match all)
  // We want to mark it with match true but the smallest specificity
  if (patternItemTrimmed === MATCH_ALL_ITEM) {
    return {
      match: true,
      specificity: 0,
      excluded: false,
    };
  }
  const { excluded, patternItemWithoutExcludeSign } = parseExclusion(patternItemTrimmed);
  if (isDirItem(patternItemWithoutExcludeSign)) {
    return { ...isMatchDirPatternItem(rootDir, patternItemWithoutExcludeSign), excluded };
  }
  return { ...isMatchNamespacePatternItem(componentName, patternItemWithoutExcludeSign), excluded };
}

export function isMatchDirPatternItem(rootDir: PathLinuxRelative, patternItem: string): MatchedPatternItem {
  // remove trailing / (will work for windows as well since the workspace.json always contain linux format)
  const patternItemStriped = stripTrailingChar(patternItem, '/').trim();

  if (isPathInside(rootDir, patternItemStriped)) {
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

function parseExclusion(patternItem: string): { excluded: boolean; patternItemWithoutExcludeSign: string } {
  if (patternItem.startsWith(EXCLUSION_SIGN)) {
    return {
      excluded: true,
      patternItemWithoutExcludeSign: patternItem.replace('!', ''),
    };
  }
  return {
    excluded: false,
    patternItemWithoutExcludeSign: patternItem,
  };
}
