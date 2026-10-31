export { SnapsDistance } from './snaps-distance';
export { getDivergeData, getDivergeDataBetweenTwoSnaps } from './get-diverge-data';
export {
  VersionInfo,
  getAllVersionHashes,
  getAllVersionHashesMemoized,
  hasVersionByRef,
  getAllVersionParents,
  getAllVersionsInfo,
  indexVersionObjects,
  VersionObjectsByHash,
  getSubsetOfVersionParents,
  getVersionParentsFromVersion,
  GetAllVersionHashesParams,
} from './traverse-versions';
export { TargetHeadNotFound } from './target-head-not-found';
export { LocalHeadNotFound } from './local-head-not-found';
export { HeadNotFound } from './head-not-found';
export { ParentNotFound } from './parent-not-found';
export { NoCommonSnap } from './no-common-snap';
export { VersionNotFound } from './version-not-found';
export { VersionNotFoundOnFS } from './version-not-found-on-fs';
