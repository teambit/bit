// @flow
import R from 'ramda';
import BitId from '../../bit-id/bit-id';
import hasWildcard from '../../utils/string/has-wildcard';
import isBitIdMatchByWildcards from '../../utils/bit/is-bit-id-match-by-wildcards';

export type OverrideComponent = {
  dependencies?: Object,
  devDependencies?: Object,
  peerDependencies?: Object,
  envs?: Object
};

export default class ComponentsOverrides {
  overrides: { [string]: OverrideComponent };
  constructor(overrides: { [string]: OverrideComponent }) {
    this.overrides = overrides;
  }
  static load(overrides: Object = {}) {
    return new ComponentsOverrides(overrides);
  }
  getOverrideComponentData(bitId: BitId): ?OverrideComponent {
    const exactMatch = Object.keys(this.overrides).find(
      idStr => bitId.toStringWithoutVersion() === idStr || bitId.toStringWithoutScopeAndVersion() === idStr
    );
    const matchByGlobPattern = Object.keys(this.overrides).filter(idStr => this.isMatchByWildcard(bitId, idStr));
    const allMatches = matchByGlobPattern.sort(this.sortWildcardsByNamespaceLength);
    if (exactMatch) {
      allMatches.push(exactMatch);
    }

    if (!allMatches.length) return null;
    const overrideValues = allMatches.map(match => this.overrides[match]);
    const fields = ['env', 'dependencies', 'devDependencies', 'peerDependencies'];
    return overrideValues.reduce((acc, current) => {
      if (!current) return acc;
      fields.forEach((field) => {
        if (!current[field]) return;
        if (!acc[field]) acc[field] = {};
        if (field === 'env') {
          ['compiler', 'tester'].forEach((envField) => {
            if (!current.env[envField]) return;
            acc.env[envField] = current.env[envField];
          });
        } else {
          acc[field] = Object.assign(acc[field], current[field]);
        }
      });
      return acc;
    }, {});
  }
  getAllDependenciesOverridesOfComponents(bitId: BitId): Object {
    const componentData = this.getOverrideComponentData(bitId);
    if (!componentData) return {};
    return Object.assign(
      componentData.dependencies || {},
      componentData.devDependencies || {},
      componentData.peerDependencies
    );
  }
  isMatchByWildcard(bitId: BitId, idWithPossibleWildcard: string): boolean {
    if (!hasWildcard(idWithPossibleWildcard)) return false;
    return isBitIdMatchByWildcards(bitId, idWithPossibleWildcard);
  }

  /**
   * sort for the more generic (less namespaces) to the more specific (more namespaces)
   * e.g.
   * src/*
   * src/utils/*
   * src/utils/javascript/*
   */
  sortWildcardsByNamespaceLength(a: string, b: string): number {
    const numOfNamespaces = str => (str.match(/\//g) || []).length;
    return numOfNamespaces(a) - numOfNamespaces(b);
  }
}
