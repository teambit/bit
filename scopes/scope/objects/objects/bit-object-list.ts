import type BitObject from './object';
import type Ref from './ref';
import { ExportMetadata, Lane, LaneHistory, ModelComponent, Version, VersionHistory } from '../models';

export class BitObjectList {
  constructor(private objects: BitObject[]) {}

  getComponents(): ModelComponent[] {
    return this.objects.filter((object) => object instanceof ModelComponent) as ModelComponent[];
  }

  getVersions(): Version[] {
    return this.objects.filter((object) => object instanceof Version) as Version[];
  }

  getLanes(): Lane[] {
    return this.objects.filter((object) => object instanceof Lane) as Lane[];
  }

  getVersionHistories(): VersionHistory[] {
    return this.objects.filter((object) => object instanceof VersionHistory) as VersionHistory[];
  }

  getLaneHistories(): LaneHistory[] {
    return this.objects.filter((object) => object instanceof LaneHistory) as LaneHistory[];
  }

  getAll(): BitObject[] {
    return this.objects;
  }

  /**
   * finds an object of this list by its ref. it has the same signature as `Repository.load()`, so these objects can be
   * used where a repository is expected, e.g. `Version.loadFlattenedDependencies()`.
   */
  async load(ref: Ref): Promise<BitObject | undefined> {
    return this.objects.find((object) => object.hash().isEqual(ref));
  }

  excludeTypes(types: string[]): BitObject[] {
    return this.objects.filter((object) => !types.includes(object.getType()));
  }

  getExportMetadata(): ExportMetadata | undefined {
    return this.objects.find((object) => object instanceof ExportMetadata) as ExportMetadata | undefined;
  }

  /**
   * object that needs merge operation before saving them into the scope, such as ModelComponent
   */
  getObjectsRequireMerge() {
    const typeRequireMerge = this.objectTypesRequireMerge();
    return this.objects.filter((object) => typeRequireMerge.some((ObjClass) => object instanceof ObjClass));
  }

  /**
   * object that don't need merge operation and can be saved immediately into the scope.
   * such as Source or Version
   */
  getObjectsNotRequireMerge() {
    const typeRequireMerge = this.objectTypesRequireMerge();
    return this.objects.filter((object) => typeRequireMerge.every((ObjClass) => !(object instanceof ObjClass)));
  }

  private objectTypesRequireMerge() {
    return [ModelComponent, Lane, VersionHistory, LaneHistory];
  }
}
