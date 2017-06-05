// @flow
import path from 'path';
import AbstractLink from './abstract-link';

export default class Link extends AbstractLink {
  to: string;

  constructor(from: string, to: string) {
    super(from);
    this.to = to;
  }

  get relativeDestination(): string {
    return path.relative(path.dirname(this.from), this.to);
  }

  get template(): string {
    return `module.exports = require('${this.relativeDestination}');`;
  }

  static create({ from, to }: { from: string, to: string }): Link {
    return new Link(from, to);
  }
}
