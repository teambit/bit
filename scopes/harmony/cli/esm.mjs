// eslint-disable-next-line import/no-unresolved
import cjsModule from './index.js';

export const CLIAspect = cjsModule.CLIAspect;
export const MainRuntime = cjsModule.MainRuntime;
export const handleUnhandledRejection = cjsModule.handleUnhandledRejection;
export const handleErrorAndExit = cjsModule.handleErrorAndExit;
export const setExitOnUnhandledRejection = cjsModule.setExitOnUnhandledRejection;
export const defaultErrorHandler = cjsModule.defaultErrorHandler;
export const globalFlags = cjsModule.globalFlags;
export const CLIParser = cjsModule.CLIParser;
export const YargsExitWorkaround = cjsModule.YargsExitWorkaround;
export const getArgsData = cjsModule.getArgsData;
export const getCommandName = cjsModule.getCommandName;
export const getFlagsData = cjsModule.getFlagsData;

export default cjsModule;
