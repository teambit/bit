export {
  BitMap,
  GetBitMapComponentOptions,
  PathChangeResult,
  CURRENT_BITMAP_SCHEMA,
  SCHEMA_FIELD,
  LANE_KEY,
  normalizeBitmapContentForVersioning,
  readVersionedBitmapEntries,
  VersionedBitmapEntry,
  fileContentsForVersioning,
} from './bit-map';
export { MissingBitMapComponent, MissingMainFile, InvalidBitMap } from './exceptions';
export {
  ComponentMapData,
  ComponentMapFile,
  ComponentMap,
  Config,
  filterByIgnoreFiles,
  filterByOwnIgnoreFile,
  filterByScanIgnorePatterns,
  getFilesByDir,
  getIgnoreListHarmony,
  getScanIgnorePatterns,
  isWorkspaceMapFile,
  NextVersion,
  WORKSPACE_ROOT_DIR,
} from './component-map';
