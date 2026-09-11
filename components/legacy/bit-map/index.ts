export {
  BitMap,
  GetBitMapComponentOptions,
  PathChangeResult,
  CURRENT_BITMAP_SCHEMA,
  SCHEMA_FIELD,
  LANE_KEY,
  normalizeBitmapContentForVersioning,
  fileContentsForVersioning,
} from './bit-map';
export { MissingBitMapComponent, MissingMainFile, InvalidBitMap } from './exceptions';
export {
  ComponentMapData,
  ComponentMapFile,
  ComponentMap,
  Config,
  getIgnoreListHarmony,
  isWorkspaceMapFile,
  NextVersion,
  SCAN_IGNORE_LIST,
  WORKSPACE_ROOT_DIR,
} from './component-map';
