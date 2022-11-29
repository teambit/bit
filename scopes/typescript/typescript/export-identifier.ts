import { Identifier } from './identifier';

export class ExportIdentifier extends Identifier {
  exported: true;

  constructor(id: string, filePath: string) {
    super(id, filePath);
    this.exported = true;
  }

  static isExportIdentifier(identifier: Identifier): identifier is ExportIdentifier {
    return 'exported' in identifier;
  }
}
