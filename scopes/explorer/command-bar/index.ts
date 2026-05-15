export { CommandBarAspect, CommandBarAspect as default } from './command-bar.aspect';
export { commandBarCommands } from './command-bar.commands';
export type { SearchProvider } from './searchers';
export type { CommandBarUI, CommandEntry } from './command-bar.ui.runtime';
export type { CommandHandler, CommandId, Keybinding } from './types';
export type { SearchResult, ResultsComponentProps, SearchResults } from '@teambit/explorer.ui.command-bar';
export type { FuzzySearchItem } from '@teambit/explorer.ui.command-bar';
// UI value exports removed:
//   - FuzzySearcher / CommandBarItem (was: '@teambit/explorer.ui.command-bar')
// UI callers should import from that package directly.
