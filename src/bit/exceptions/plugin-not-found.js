/** @flow */
export default class CompilerNotFoundException extends Error {
  plugin: string;
    
  constructor(plugin : string) {
    super();
    this.plugin = plugin;
  }
}
