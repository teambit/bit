import { humanizeCompositionId } from '@teambit/compositions.model.composition-id';

export type CompositionProps = {
  identifier: string;
  filepath?: string;
  displayName?: string;
};

export type CompositionBrowserMetadata = {
  displayName?: string;
  identifier: string;
}

export type CompositionBrowserMetadataObject = {
  compositions: CompositionBrowserMetadata[]
}

export class Composition {
  constructor(
    /**
     * identifier of the composition
     */
    readonly identifier: string,

    /**
     * file path in which the composition is contained.
     */
    readonly filepath?: string,

    /**
     * set explicit display name
     */
    private _displayName?: string
  ) {}

  get displayName() {
    return this._displayName || humanizeCompositionId(this.identifier);
  }

  toObject() {
    return {
      identifier: this.identifier,
      filepath: this.filepath,
      displayName: this._displayName,
    };
  }

  toBrowserMetaDataObject(): CompositionBrowserMetadata {
    return {
      identifier: this.identifier,
      displayName: this._displayName,
    };
  }

  static fromArray(compositions: CompositionProps[]): Composition[] {
    return compositions.map((composition) => {
      return new Composition(composition.identifier, composition.filepath, composition.displayName);
    });
  }
}
