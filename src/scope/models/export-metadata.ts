import { BitId } from '../../bit-id';
import { getStringifyArgs } from '../../utils';
import BitObject from '../objects/object';
import Ref from '../objects/ref';

type ExportMetadataProps = {
  exportVersions: ExportVersions[];
};

export type ExportVersions = { id: BitId; versions: Ref[] };

export default class ExportMetadata extends BitObject {
  exportVersions: ExportVersions[];
  constructor(props: ExportMetadataProps) {
    super();
    this.exportVersions = props.exportVersions;
  }

  toObject(): Record<string, any> {
    return {
      exportVersions: this.exportVersions.map((exportComp) => ({
        id: exportComp.id.toStringWithoutVersion(),
        versions: exportComp.versions.map((ref) => ref.toString()),
      })),
    };
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  toString(pretty: boolean): string {
    const args = getStringifyArgs(pretty);
    return JSON.stringify(this.toObject(), ...args);
  }

  id(): string {
    return ExportMetadata.name;
  }

  toBuffer(pretty): Buffer {
    return Buffer.from(this.toString(pretty));
  }

  static parse(contents: string): ExportMetadata {
    const parsed = JSON.parse(contents);
    const props: ExportMetadataProps = {
      exportVersions: parsed.exportVersions.map((comp) => ({
        id: BitId.parse(comp.id, true),
        versions: comp.versions.map((ver) => Ref.from(ver)),
      })),
    };
    return new ExportMetadata(props);
  }
}
