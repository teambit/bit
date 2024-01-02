import { Identifier } from './identifier';

export class ExportIdentifier extends Identifier {
  exported: true;

  constructor(id: string, filePath: string, aliasId?: string, sourceFilePath?: string) {
    super(id, filePath, aliasId, sourceFilePath);
    this.exported = true;
  }

  static isExportIdentifier(identifier: Identifier): identifier is ExportIdentifier {
    return 'exported' in identifier;
  }
}
