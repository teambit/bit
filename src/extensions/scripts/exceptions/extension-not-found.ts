export class ExtensionNotFound extends Error {
  extName?: string;
  msg: string;
  constructor(extName?: string) {
    super();
    this.extName = extName;
    // @todo: find a better way to deal with these errors
    this.msg = `extension ${extName || ''} was not found`;
  }
}
