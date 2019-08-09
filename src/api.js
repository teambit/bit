/** @flow */

import { getScopeComponent, addMany } from './api/consumer/index';
import type { AddProps } from './consumer/component-ops/add-components/add-components';
import { scopeList } from './api/scope/index';
import Extension from './extensions/extension';
import HooksManager from './hooks';
import type { BaseLoadArgsProps } from './extensions/base-extension';

HooksManager.init();

module.exports = {
  show: (scopePath: string, id: string, opts: Object) =>
    getScopeComponent({ scopePath, id, allVersions: opts && opts.versions }).then(({ component }) => {
      if (Array.isArray(component)) {
        return component.map(v => v.toObject());
      }
      return component.toObject();
    }),
  list: (scopePath: string) =>
    scopeList(scopePath).then(listScopeResult => listScopeResult.map(result => result.id.toString())),
  addMany: async (components: AddProps[], alternateCwd?: string) => {
    return addMany(components, alternateCwd);
  },
  /**
   * Load extension programmatically
   */
  loadExtension: async (args: BaseLoadArgsProps): Promise<Extension> => {
    const extension = await Extension.load(args);
    return Promise.resolve(extension);
  }
};
