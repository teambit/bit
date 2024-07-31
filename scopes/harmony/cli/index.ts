import { CLIAspect, MainRuntime } from './cli.aspect';
export { CLIParser } from './cli-parser';
export type { CLIMain, CommandList, CommandsSlot } from './cli.main.runtime';
export { handleUnhandledRejection, handleErrorAndExit } from './handle-errors';
export type { Command, CLIArgs, Flags, GenericObject, CommandOptions } from '@teambit/legacy/dist/cli/command';
export * from './exceptions';

export { CLIAspect as default, MainRuntime, CLIAspect };
