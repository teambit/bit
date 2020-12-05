import type { SerializableMap } from '@teambit/types.serializable';
import { DocPropList } from './doc-prop-list';

export class Doc {
  constructor(readonly filePath: string, readonly props: DocPropList) {}

  toObject() {
    return {
      filePath: this.filePath,
      props: this.props.docProps,
    };
  }

  static from(path: string, propObject: SerializableMap) {
    return new Doc(path, DocPropList.from(propObject));
  }
}
