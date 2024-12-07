import { CLIAspect, MainRuntime } from './cli.aspect';
import globalFlags from './global-flags';
import defaultErrorHandler from './default-error-handler';
export { CLIParser } from './cli-parser';
export type { CLIMain, CommandList, CommandsSlot } from './cli.main.runtime';
export { handleUnhandledRejection, handleErrorAndExit, setExitOnUnhandledRejection } from './handle-errors';
export { globalFlags };
export { defaultErrorHandler };
export type { Command, CLIArgs, Flags, GenericObject, CommandOptions } from './command';
export * from './exceptions';

export { CLIAspect as default, MainRuntime, CLIAspect };
