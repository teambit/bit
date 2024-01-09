import { CLIAspect, MainRuntime } from './cli.aspect';

export type { CLIMain, CommandList, CommandsSlot } from './cli.main.runtime';
export type { Command, CLIArgs, Flags, GenericObject } from '@teambit/legacy/dist/cli/command';
export type { CommandOptions } from '@teambit/legacy/dist/cli/legacy-command';
export * from './exceptions';

export { CLIAspect as default, MainRuntime, CLIAspect };
