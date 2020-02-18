import { Serializable } from 'cleargraph';

export class Dependency implements Serializable {
  type: 'dev' | 'peer' | 'regular';
  constructor(type) {
    this.type = type;
  }
  toString(): string {
    return this.type;
  }
}
