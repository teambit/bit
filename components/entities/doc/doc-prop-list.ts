import { DocProp } from './doc-prop';

export class DocPropList {
  constructor(readonly docProps: DocProp[]) {}

  get(name: string) {
    return this.docProps.find((docProp) => docProp.name === name);
  }

  static from(object: any): DocPropList {
    const props = Object.keys(object)
      .map((key) => {
        if (!object[key]) return undefined;
        return new DocProp(key, object[key]);
      })
      .filter((prop) => !!prop) as DocProp[];

    return new DocPropList(props);
  }
}
