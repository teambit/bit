/** @flow */

import { getScopeComponent } from './api/consumer/index';
import { scopeList } from './api/scope/index';
import Extension from './extensions/extension';
import logger from './logger/logger';
import HooksManager from './hooks';

HooksManager.init();

module.exports = {
  show: (scopePath, id, opts) =>
    getScopeComponent({ scopePath, id, allVersions: opts && opts.versions }).then((c) => {
      if (Array.isArray(c)) {
        return c.map(v => v.toObject());
      }
      return c.toObject();
    }),
  list: scopePath => scopeList(scopePath).then(components => components.map(c => c.id.toString())),
  /**
   * Load extension programmatically
   */
  loadExtension: async (
    extensionName: string,
    extensionFilePath: string,
    extensionConfig: Object,
    extensionOptions: Object
  ): Extension => {
    const extension = await Extension.loadFromFile(extensionName, extensionFilePath, extensionConfig, extensionOptions);
    return Promise.resolve(extension);
  }
};
