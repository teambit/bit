/** @flow */

import { getScopeComponent, addMany } from './api/consumer/index';
import type { AddProps } from './consumer/component-ops/add-components/add-components';
import { scopeList } from './api/scope/index';
import Extension from './extensions/extension';
import HooksManager from './hooks';

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
  addMany: async (components: AddProps[], consumerPath: string) => {
    return addMany(components, consumerPath);
  },
  /**
   * Load extension programmatically
   */
  loadExtension: async (
    extensionName: string,
    extensionFilePath: string,
    extensionConfig: Object,
    extensionOptions: Object
  ): Promise<Extension> => {
    const extension = await Extension.loadFromFile({
      name: extensionName,
      filePath: extensionFilePath,
      rawConfig: extensionConfig,
      options: extensionOptions
    });
    return Promise.resolve(extension);
  }
};
