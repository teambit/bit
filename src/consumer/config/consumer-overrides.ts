import chalk from 'chalk';
import R from 'ramda';

import BitId from '../../bit-id/bit-id';
import { DEPENDENCIES_FIELDS, OVERRIDE_FILE_PREFIX } from '../../constants';
import GeneralError from '../../error/general-error';
import logger from '../../logger/logger';
import isBitIdMatchByWildcards from '../../utils/bit/is-bit-id-match-by-wildcards';
import hasWildcard from '../../utils/string/has-wildcard';
import { validateUserInputType } from '../../utils/validate-type';
import Component from '../component/consumer-component';
import AbstractConfig from './abstract-config';
import { ComponentOverridesData } from './component-overrides';

export type ConsumerOverridesOfComponent = ComponentOverridesData & {
  extensions?: Record<string, any>;
  env?: Record<string, any>;
  propagate?: boolean; // whether propagate to a more general rule,
  defaultScope?: string; // default scope to export to
  defaultOwner?: string; // default scope to export to
};

export type ConsumerOverridesConfig = { [key: string]: ConsumerOverridesOfComponent };
export const overridesForbiddenFields = ['name', 'main', 'version', 'bit'];
export const overridesBitInternalFields = ['propagate', 'exclude', 'env', 'defaultScope', 'extensions'];
export const nonPackageJsonFields = [...DEPENDENCIES_FIELDS, ...overridesBitInternalFields];

export default class ConsumerOverrides {
  overrides: ConsumerOverridesConfig;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  hasChanged: boolean; // whether the overrides has been changed (so then it should write them to fs)
  constructor(overrides: ConsumerOverridesConfig) {
    this.overrides = overrides;
  }
  static load(overrides: Record<string, any> = {}) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return new ConsumerOverrides(overrides);
  }
  getOverrideComponentData(bitId: BitId): ConsumerOverridesOfComponent | undefined {
    const matches = this._getAllRulesMatchedById(bitId);
    if (!matches.length) {
      return undefined;
    }
    const overrideValues = matches.map((match) => R.clone(this.overrides[match]));
    let stopPropagation = false;
    return overrideValues.reduce((acc, current) => {
      if (stopPropagation) {
        return acc;
      }
      if (current.propagate === false) {
        acc.propagate = false;
        stopPropagation = true;
      }
      this._updateSpecificOverridesWithGeneralOverrides(current, acc);
      return acc;
    }, {});
  }
  _updateSpecificOverridesWithGeneralOverrides(
    generalOverrides: Record<string, any>,
    specificOverrides: Record<string, any>
  ) {
    const isObjectAndNotArray = (val) => typeof val === 'object' && !Array.isArray(val);
    Object.keys(generalOverrides).forEach((field) => {
      switch (field) {
        case 'env':
          if (!specificOverrides[field]) specificOverrides[field] = {};
          ['compiler', 'tester'].forEach((envField) => {
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            if (specificOverrides.env[envField] || !generalOverrides.env[envField]) return;
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            specificOverrides.env[envField] = generalOverrides.env[envField];
          });
          break;
        case 'propagate':
        case 'exclude':
          // it's a system field, do nothing
          break;
        default:
          if (isObjectAndNotArray(specificOverrides[field]) && isObjectAndNotArray(generalOverrides[field])) {
            specificOverrides[field] = Object.assign({}, generalOverrides[field], specificOverrides[field]);
          } else if (!specificOverrides[field]) {
            specificOverrides[field] = generalOverrides[field];
          }
        // when specificOverrides[field] is set and not an object, do not override it by the general one
      }
    });
  }
  _getAllRulesMatchedById(bitId: BitId): string[] {
    const exactMatch = this.findExactMatch(bitId);
    const matchByGlobPattern = Object.keys(this.overrides).filter((idStr) => this._isMatchByWildcard(bitId, idStr));
    const nonExcluded = matchByGlobPattern.filter((match) => !this._isExcluded(this.overrides[match], bitId));
    const allMatches = nonExcluded.sort(ConsumerOverrides.sortWildcards);
    if (exactMatch) allMatches.unshift(exactMatch);
    return allMatches;
  }
  _isMatchByWildcard(bitId: BitId, idWithPossibleWildcard: string): boolean {
    if (!hasWildcard(idWithPossibleWildcard)) return false;
    return isBitIdMatchByWildcards(bitId, idWithPossibleWildcard);
  }
  _isExcluded(overridesValues: Record<string, any>, bitId: BitId) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (!overridesValues.exclude || !overridesValues.exclude.length) {
      return false;
    }
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return overridesValues.exclude.some(
      (excludeRule) =>
        this._isMatchByWildcard(bitId, excludeRule) ||
        bitId.toStringWithoutVersion() === excludeRule ||
        bitId.toStringWithoutScopeAndVersion() === excludeRule
    );
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
    const numOfNamespaces = (str) => (str.match(/\//g) || []).length;
    const numOfWildcards = (str) => (str.match(/\*/g) || []).length;
    const indexOfFirstWildcard = (str) => str.indexOf('*');
    const byNamespaces = numOfNamespaces(b) - numOfNamespaces(a);
    if (byNamespaces !== 0) return byNamespaces;
    const byWildcards = numOfWildcards(a) - numOfWildcards(b);
    if (byWildcards !== 0) return byWildcards;
    // both have the same number of namespaces and the same number of wildcards
    // e.g. a component `utils/is-string` matches two rules: `utils/*` and `*/is-string`.
    // the one with the wildcard more left should be first as it is more specific.
    return indexOfFirstWildcard(a) - indexOfFirstWildcard(b);
  }

  updateOverridesIfChanged(component: Component, areEnvsChanged: boolean): boolean {
    const overrides: ConsumerOverridesOfComponent = component.overrides.componentOverridesData;
    const id: BitId = component.id;
    const existingOverrides = this.getOverrideComponentData(id);
    if (!areEnvsChanged && this.areOverridesObjectsEqual(existingOverrides, overrides)) return false;
    const exactMatch = this.findExactMatch(id);
    const key = exactMatch || id.toStringWithoutVersion();
    const env = {};
    if (component.compiler) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      env.compiler = AbstractConfig.convertEnvToStringIfPossible(component.compiler.toBitJsonObject('.'));
    }
    if (component.tester) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      env.tester = AbstractConfig.convertEnvToStringIfPossible(component.tester.toBitJsonObject('.'));
    }
    if (!R.isEmpty(env)) overrides.env = env;
    this.overrides[key] = overrides;
    this.hasChanged = true;
    return true;
  }

  areOverridesObjectsEqual(
    overridesA: ConsumerOverridesOfComponent | null | undefined,
    overridesB: ConsumerOverridesOfComponent
  ): boolean {
    // seems like R.equals does a great job here. it compares objects by values (not by reference).
    // also it disregards the keys order.
    return R.equals(overridesA || {}, overridesB || {});
  }

  findExactMatch(bitId: BitId): string | null | undefined {
    return Object.keys(this.overrides).find(
      (idStr) => bitId.toStringWithoutVersion() === idStr || bitId.toStringWithoutScopeAndVersion() === idStr
    );
  }

  removeExactMatch(bitId: BitId): boolean {
    const exactMatch = this.findExactMatch(bitId);
    if (!exactMatch) return false;
    delete this.overrides[exactMatch];
    return true;
  }

  static validate(overrides: Record<string, any>): void {
    if (typeof overrides === 'undefined') return;
    const message = 'consumer-config (either bit.json or package.json "bit")';
    validateUserInputType(message, overrides, 'overrides', 'object');
    Object.keys(overrides).forEach((id) => validateComponentOverride(id, overrides[id]));

    function validateComponentOverride(id, override) {
      validateUserInputType(message, override, `overrides.${id}`, 'object');
      Object.keys(override).forEach((field) => {
        if (overridesForbiddenFields.includes(field)) {
          throw new GeneralError(`${message} found a forbidden field "${field}" inside "overrides.${id}" property.
the following fields are not allowed: ${overridesForbiddenFields.join(', ')}.`);
        }
        if (DEPENDENCIES_FIELDS.includes(field)) {
          validateDependencyField(field, override, id);
        } else if (field === 'env') {
          validateEnv(override, id);
        } else if (field === 'exclude') {
          validateUserInputType(message, override.exclude, `overrides.${id}.exclude`, 'array');
        }
      });
    }

    function validateDependencyField(field: string, override: Record<string, any>, id: string) {
      validateUserInputType(message, override[field], `overrides.${id}.${field}`, 'object');
      Object.keys(override[field]).forEach((rule) => {
        validateUserInputType(message, override[field][rule], `overrides.${id}.${field}.${rule}`, 'string');
        if (rule.startsWith(OVERRIDE_FILE_PREFIX)) {
          // @todo: once v15 is out, this warning should be replaced by an error
          logger.console(
            chalk.yellow(
              `warning: file overrides (using "${OVERRIDE_FILE_PREFIX}") is deprecated and will be removed on the next major version`
            )
          );
        }
      });
    }
    function validateEnv(override: Record<string, any>, id: string) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      validateUserInputType(message, override.env, `overrides.${id}.env`, 'object');
    }
  }
}
