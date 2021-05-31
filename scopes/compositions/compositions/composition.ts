import { humanizeCompositionId } from '@teambit/compositions.model.composition-id';

export type CompositionProps = {
  identifier: string;
  filepath?: string;
};

export class Composition {
  constructor(
    /**
     * identifier of the composition
     */
    readonly identifier: string,

    /**
     * file path in which the composition is contained.
     */
    readonly filepath?: string
  ) {}

  get displayName() {
    return humanizeCompositionId(this.identifier);
  }

  toObject() {
    return {
      identifier: this.identifier,
      filepath: this.filepath,
    };
  }

  static fromArray(compositions: CompositionProps[]): Composition[] {
    return compositions.map((composition) => {
      return new Composition(composition.identifier, composition.filepath);
    });
  }
}
