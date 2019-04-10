// @flow
import R from 'ramda';
import BitId from '../../bit-id/bit-id';
import hasWildcard from '../../utils/string/has-wildcard';
import isBitIdMatchByWildcards from '../../utils/bit/is-bit-id-match-by-wildcards';
import { validateUserInputType } from '../../utils/validate-type';
import type Component from '../component/consumer-component';

export type ConsumerOverridesOfComponent = {
  dependencies?: Object,
  devDependencies?: Object,
  peerDependencies?: Object,
  env?: Object,
  propagate?: boolean // whether propagate to a more general rule
};

export type ConsumerOverridesConfig = { [string]: ConsumerOverridesOfComponent };

export const dependenciesFields = ['dependencies', 'devDependencies', 'peerDependencies'];

export default class ConsumerOverrides {
  overrides: ConsumerOverridesConfig;
  hasChanged: boolean; // whether the overrides has been changed (so then it should write them to fs)
  constructor(overrides: ConsumerOverridesConfig) {
    this.overrides = overrides;
  }
  static load(overrides: Object = {}) {
    return new ConsumerOverrides(overrides);
  }
  getOverrideComponentData(bitId: BitId, consumerConfig: ?Object = {}): ?ConsumerOverridesOfComponent {
    const getMatches = (): string[] => {
      const exactMatch = this.findExactMatch(bitId);
      const matchByGlobPattern = Object.keys(this.overrides).filter(idStr => this.isMatchByWildcard(bitId, idStr));
      const allMatches = matchByGlobPattern.sort(ConsumerOverrides.sortWildcards);
      if (exactMatch) allMatches.unshift(exactMatch);
      return allMatches;
    };
    const matches = getMatches();
    if (!matches.length && R.isEmpty(consumerConfig)) return null;
    const overrideValues = matches.map(match => this.overrides[match]);
    const fields = ['env', 'dependencies', 'devDependencies', 'peerDependencies'];
    let stopPropagation = false;
    return overrideValues.reduce((acc, current) => {
      if (stopPropagation) return acc;
      if (!current.propagate) {
        stopPropagation = true;
      }
      fields.forEach((field) => {
        if (!current[field]) return;
        if (!acc[field]) acc[field] = {};
        if (field === 'env') {
          ['compiler', 'tester'].forEach((envField) => {
            // $FlowFixMe we made sure before that current.env is set
            if (acc.env[envField] || !current.env[envField]) return;
            acc.env[envField] = current.env[envField];
          });
        } else if (dependenciesFields.includes(field)) {
          // $FlowFixMe
          acc[field] = Object.assign(current[field], acc[field]);
        } else {
          throw new Error(`consumer-overrides, ${field} does not have a merge strategy`);
        }
      });
      return acc;
    }, consumerConfig);
  }
  isMatchByWildcard(bitId: BitId, idWithPossibleWildcard: string): boolean {
    if (!hasWildcard(idWithPossibleWildcard)) return false;
    return isBitIdMatchByWildcards(bitId, idWithPossibleWildcard);
  }
  /**
   * sort from the more specific (more namespaces) to the more generic (less namespaces)
   * e.g.
   * src/utils/javascript/*
   * src/utils/javascript/*
   * src/utils/*
   * src/*
   *
   * more namespaces (slashes) === more specific
   * more wildcards === less specific
   *
   * if both have the same number of namespaces (slashes), the one with less wildcards is first.
   * if both have the same number of wildcards, the one with more namespaces is first.
   *
   * a reminder about compare function:
   * If the result is negative a is sorted before b.
   * If the result is positive b is sorted before a.
   * If the result is 0 no changes is done with the sort order of the two values.
   */
  static sortWildcards(a: string, b: string): number {
    const numOfNamespaces = str => (str.match(/\//g) || []).length;
    const numOfWildcards = str => (str.match(/\*/g) || []).length;
    const indexOfFirstWildcard = str => str.indexOf('*');
    const byNamespaces = numOfNamespaces(b) - numOfNamespaces(a);
    if (byNamespaces !== 0) return byNamespaces;
    const byWildcards = numOfWildcards(a) - numOfWildcards(b);
    if (byWildcards !== 0) return byWildcards;
    // both have the same number of namespaces and the same number of wildcards
    // e.g. a component `utils/is-string` matches two rules: `utils/*` and `*/is-string`.
    // the one with the wildcard more left should be first as it is more specific.
    return indexOfFirstWildcard(a) - indexOfFirstWildcard(b);
  }

  async updateOverridesIfChanged(component: Component, areEnvsChanged: boolean): Promise<boolean> {
    const overrides: ConsumerOverridesOfComponent = component.overrides.componentOverridesData;
    const id: BitId = component.id;
    const existingOverrides = this.getOverrideComponentData(id);
    if (!areEnvsChanged && this.areOverridesObjectsEqual(existingOverrides, overrides)) return false;
    const exactMatch = this.findExactMatch(id);
    const key = exactMatch || id.toStringWithoutVersion();
    const env = {};
    if (component.compiler) {
      env.compiler = component.compiler.toBitJsonObject('.');
    }
    if (component.tester) {
      env.tester = component.tester.toBitJsonObject('.');
    }
    if (!R.isEmpty(env)) overrides.env = env;
    this.overrides[key] = overrides;
    this.hasChanged = true;
    return true;
  }

  areOverridesObjectsEqual(
    overridesA: ?ConsumerOverridesOfComponent,
    overridesB: ConsumerOverridesOfComponent
  ): boolean {
    // seems like R.equals does a great job here. it compares objects by values (not by reference).
    // also it disregards the keys order.
    return R.equals(overridesA, overridesB);
  }

  findExactMatch(bitId: BitId): ?string {
    return Object.keys(this.overrides).find(
      idStr => bitId.toStringWithoutVersion() === idStr || bitId.toStringWithoutScopeAndVersion() === idStr
    );
  }

  static validate(overrides: Object): void {
    if (typeof overrides === 'undefined') return;
    const message = 'consumer-config (either bit.json or package.json "bit")';
    validateUserInputType(message, overrides, 'overrides', 'object');
    Object.keys(overrides).forEach((field) => {
      if (dependenciesFields.includes(field)) {
        validateDependencyField(field);
      } else if (field === 'env') {
        validateEnv();
      }
    });

    function validateDependencyField(field: string) {
      validateUserInputType(message, overrides[field], `overrides.${field}`, 'object');
      Object.keys(overrides[field]).forEach((rule) => {
        validateUserInputType(message, overrides[field][rule], `overrides.${field}.${rule}`, 'string');
      });
    }
    function validateEnv() {
      validateUserInputType(message, overrides.env, 'overrides.env', 'object');
    }
  }
}
