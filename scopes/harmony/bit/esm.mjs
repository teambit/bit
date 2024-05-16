// eslint-disable-next-line import/no-unresolved
import cjsModule from './index.js';

export const Aspect = cjsModule.Aspect;
export const RuntimeDefinition = cjsModule.RuntimeDefinition;
export const Hook = cjsModule.Hook;
export const HookRegistry = cjsModule.HookRegistry;
export const manifestsMap = cjsModule.manifestsMap;
export const isCoreAspect = cjsModule.isCoreAspect;
export const getAllCoreAspectsIds = cjsModule.getAllCoreAspectsIds;
export const registerCoreExtensions = cjsModule.registerCoreExtensions;
export const BitAspect = cjsModule.BitAspect;
export const loadBit = cjsModule.loadBit;
export const restoreGlobals = cjsModule.restoreGlobals;
export const restoreGlobalsFromSnapshot = cjsModule.restoreGlobalsFromSnapshot;
export const takeLegacyGlobalsSnapshot = cjsModule.takeLegacyGlobalsSnapshot;

export default cjsModule;

