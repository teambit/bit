/** @flow */
export default class PluginNotFoundException extends Error {
  plugin: string;

  constructor(plugin: string) {
    super();
    this.plugin = plugin;
  }
}
