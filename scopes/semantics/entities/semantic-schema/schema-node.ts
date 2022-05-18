import { instanceToPlain } from 'class-transformer';

/**
 * a convenient abstract class for all schema to extend.
 * the reason for having it as an abstract class and not an interface, for now, is mostly for the `__schema` prop.
 * this way it won't need to be implemented in each one of the subclasses.
 */
export abstract class SchemaNode {
  readonly __schema = this.constructor.name;
  readonly location?: Location;
  readonly signature?: string;

  abstract toString(): string;

  toObject() {
    return instanceToPlain(this);
  }
}

export type Location = { file: string; line: number; character: number };
