/**
 * Commands that only query and never change the workspace or the scope.
 * An entry is either a command name ("status") or a command with its sub-command ("lane show").
 * Aliases are listed explicitly because callers match the command string as typed.
 */
export const READ_ONLY_COMMANDS: ReadonlySet<string> = new Set([
  'status',
  's', // alias of status
  'mini-status',
  'list',
  'ls', // alias of list
  'info',
  'show',
  'schema',
  'artifacts',
  'diff',
  'log',
  'blame',
  'graph',
  'deps get',
  'deps blame',
  'deps usage',
  'why',
  'config get',
  'envs list',
  'envs get',
  'env list', // alias of envs
  'env get',
  'remote list',
  'templates',
  'cat-component',
  'cat-lane',
  'cat-object',
  'cat-scope',
  'cat-version-history',
  'lane show',
  'lane list',
  'lane diff',
  'lane history',
  'lane history-diff',
  'test',
  'help',
  'version',
]);

/**
 * @param command the command name as typed, e.g. "lane"
 * @param subCommand the first argument, e.g. "show". relevant only for commands with sub-commands.
 */
export function isReadOnlyCommand(command: string, subCommand?: string): boolean {
  if (READ_ONLY_COMMANDS.has(command)) return true;
  return Boolean(subCommand) && READ_ONLY_COMMANDS.has(`${command} ${subCommand}`);
}
