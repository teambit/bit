import { CLIAspect, MainRuntime } from './cli.aspect';
import globalFlags from './global-flags';
import defaultErrorHandler from './default-error-handler';
export { CLIParser } from './cli-parser';
export type { CLIMain, CommandList, CommandsSlot } from './cli.main.runtime';
export { handleUnhandledRejection, handleErrorAndExit, setExitOnUnhandledRejection } from './handle-errors';
export { globalFlags };
export { defaultErrorHandler };
export type { Command, CLIArgs, Flags, GenericObject, CommandOptions, Report } from './command';
export { getArgsData, getCommandName, getFlagsData } from './command-helper';
export * from './exceptions';

export {
  successSymbol,
  warnSymbol,
  errorSymbol,
  bulletSymbol,
  formatItem,
  formatSection,
  formatTitle,
  formatHint,
  formatDetailsHint,
  formatSuccessSummary,
  formatWarningSummary,
  joinSections,
  renderSections,
} from './output-formatter';
export type { OutputSection } from './output-formatter';

export { CLIAspect as default, MainRuntime, CLIAspect };
