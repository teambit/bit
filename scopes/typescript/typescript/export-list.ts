import { ExportIdentifier } from './export-identifier';

export class ExportList {
  constructor(readonly exports: ExportIdentifier[]) {}

  includes(id: string) {
    return Boolean(this.exports.find((exportId) => exportId.id === id));
  }
}
