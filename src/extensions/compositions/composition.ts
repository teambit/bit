import { capitalize } from '../utils/capitalize';

export type CompositionProps = {
  identifier: string;
  filepath: string;
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
    readonly filepath: string
  ) {}

  get displayName() {
    const text = this.identifier.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

    return capitalize(text);
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
