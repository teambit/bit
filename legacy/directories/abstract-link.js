// @flow
import { writeFileP } from '../utils';

export default class AbstractLink {
  from: string;

  constructor(from: string) {
    this.from = from;
  }

  // $FlowFixMe
  get template() { // eslint-disable-line
    throw new Error('must implement');
  }

  async persist(): Promise<*> {
    return writeFileP(this.from, this.template);
  }
}
