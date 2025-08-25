// eslint-disable-next-line import/no-unresolved
import cjsModule from './index.js';

export const Consumer = cjsModule.Consumer;
export const loadConsumer = cjsModule.loadConsumer;
export const loadConsumerIfExist = cjsModule.loadConsumerIfExist;
export const getParsedHistoryMetadata = cjsModule.getParsedHistoryMetadata;
export const currentDateAndTimeToFileName = cjsModule.currentDateAndTimeToFileName;
export const ConsumerNotFound = cjsModule.ConsumerNotFound;
export const NewerVersionFound = cjsModule.NewerVersionFound;
export const ComponentOutOfSync = cjsModule.ComponentOutOfSync;
export const ComponentsPendingImport = cjsModule.ComponentsPendingImport;
export const ComponentsPendingMerge = cjsModule.ComponentsPendingMerge;
export const UnexpectedPackageName = cjsModule.UnexpectedPackageName;

export default cjsModule;