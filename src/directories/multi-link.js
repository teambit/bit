// @flow
import path from 'path';
import camelcase from 'camelcase';
import AbstractLink from './abstract-link';

export default class MultiLink extends AbstractLink {
  names: string[];

  constructor(from: string, names: string[]) {
    super(from);
    this.names = names;
  }

  get template(): string {
    const links = this.names.map(name => `${camelcase(name)}: require('.${path.sep}${name}')`);
    return `module.exports = {
  ${links.join(',\n  ')}
};`;
  }

  static create({ from, names }: { from: string, names: string[] }): MultiLink {
    return new MultiLink(from, names);
  }
}
