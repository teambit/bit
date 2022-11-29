import { instanceToPlain } from 'class-transformer';
import { DocSchema } from './schemas';

/**
 * a convenient abstract class for all schema to extend.
 * the reason for having it as an abstract class and not an interface, for now, is mostly for the `__schema` prop.
 * this way it won't need to be implemented in each one of the subclasses.
 */
export abstract class SchemaNode {
  readonly __schema = this.constructor.name;
  abstract readonly location: Location;
  readonly doc?: DocSchema;
  readonly signature?: string;
  readonly name?: string;
  readonly exported: boolean;

  abstract toString(): string;

  toObject() {
    return instanceToPlain(this);
  }
}

export type Location = {
  /**
   * file-path relative to the component root-dir. normalized to Linux.
   */
  filePath: string;
  line: number;
  character: number;
};
