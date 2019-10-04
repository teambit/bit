import AbstractError from '../../../error/abstract-error';

export default class PluginNotFoundException extends AbstractError {
  plugin: string;

  constructor(plugin: string) {
    super();
    this.plugin = plugin;
  }
}
