import { ComponentID } from '@teambit/component-id';
import { getStringifyArgs } from '@teambit/legacy.utils';
import { BitObject, Ref } from '../objects';

type ExportMetadataProps = {
  exportVersions: ExportVersions[];
};

export type ExportVersions = { id: ComponentID; versions: string[]; head: Ref };

/**
 * @deprecated since 0.0.928 (see #6758). this object is not sent to the remote anymore.
 * introduced in 0.0.782 (see #5935)
 */
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
        versions: exportComp.versions,
        head: exportComp.head.toString(),
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
        id: ComponentID.fromString(comp.id),
        versions: comp.versions,
        head: Ref.from(comp.head),
      })),
    };
    return new ExportMetadata(props);
  }
}
