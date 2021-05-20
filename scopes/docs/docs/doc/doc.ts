import type { SerializableMap } from '@teambit/toolbox.types.serializable';
import { DocPropList } from './doc-prop-list';

export class Doc {
  constructor(readonly filePath: string, readonly props: DocPropList) {}

  toObject() {
    return {
      filePath: this.filePath,
      props: this.props.docProps,
    };
  }

  /**
   * shorthand for getting the component description.
   */
  get description(): string {
    const value = this.props.get('description')?.value;
    if (!value) return '';
    return value as string;
  }

  /**
   * shorthand for getting the component labels.
   */
  get labels() {
    const value = this.props.get('labels')?.value;
    if (!value) return [];
    return value as string[];
  }

  /**
   * shorthand for getting the component labels.
   */
  get displayName() {
    return this.props.get('displayName');
  }

  static from(path: string, propObject: SerializableMap) {
    return new Doc(path, DocPropList.from(propObject));
  }
}
