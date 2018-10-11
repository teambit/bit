/** @flow */

import { getScopeComponent, addMany } from './api/consumer/index';
import type { AddProps } from './consumer/component-ops/add-components/add-components';
import { scopeList } from './api/scope/index';
// import Extension from './extensions/extension';
import HooksManager from './hooks';
import * as types from './extensions/types';

HooksManager.init();

module.exports = {
  show: (scopePath: string, id: string, opts: Object) =>
    getScopeComponent({ scopePath, id, allVersions: opts && opts.versions }).then((c) => {
      if (Array.isArray(c)) {
        return c.map(v => v.toObject());
      }
      return c.toObject();
    }),
  list: (scopePath: string) => scopeList(scopePath).then(components => components.map(c => c.id.toString())),
  addMany: async (components: AddProps[], alternateCwd?: string) => {
    return addMany(components, alternateCwd);
  },
  types,
  Extension: class Extension {}
  /**
   * Load extension programmatically
   */
  // loadExtension: async (
  //   extensionName: string,
  //   extensionFilePath: string,
  //   extensionConfig: Object,
  //   extensionOptions: Object = {}
  // ): Promise<Extension> => {
  //   if (extensionFilePath) {
  //     extensionOptions.file = extensionFilePath;
  //   }
  //   const extension = await Extension.load({
  //     name: extensionName,
  //     rawConfig: extensionConfig,
  //     options: extensionOptions
  //   });
  //   return Promise.resolve(extension);
  // }
};
