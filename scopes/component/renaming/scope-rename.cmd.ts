import type { Command, CommandOptions } from '@teambit/cli';
import { formatTitle, formatItem, formatSuccessSummary, joinSections } from '@teambit/cli';
import type { RenameResult, RenamingMain } from './renaming.main.runtime';

export class ScopeRenameCmd implements Command {
  name = 'rename <current-scope-name> <new-scope-name>';
  description =
    "rename the scope name for all components with the specified 'current scope name'. if exported, create new components and delete the original ones";
  extendedDescription = `Note: if \`<current-scope-name>\` is also the defaultScope for the workspace, this command will set \`<new-scope-name>\`
as the defaultScope instead, and that will then be set for all components by default. You may see updates in your .bitmap file
as a result of this change`;
  arguments = [
    { name: 'current-scope-name', description: 'the scope name to be replaced by another scope name' },
    { name: 'new-scope-name', description: 'a new scope name to replace the current scope name' },
  ];
  options = [
    ['', 'preserve', 'avoid renaming files and variables/classes according to the new scope name'],
    [
      'r',
      'refactor',
      'update the import statements in all dependent components to the new package name (i.e. with the new scope name)',
    ],
    ['', 'deprecate', 'for exported components, instead of deleting the original components, deprecating them'],
    ['x', 'skip-dependency-installation', 'do not install dependencies after the rename'],
  ] as CommandOptions;
  group = 'component-config';

  constructor(private renaming: RenamingMain) {}

  async report(
    [oldName, newName]: [string, string],
    {
      refactor,
      deprecate,
      preserve,
      skipDependencyInstallation,
    }: { refactor?: boolean; deprecate?: boolean; preserve?: boolean; skipDependencyInstallation?: boolean }
  ) {
    const result = await this.renaming.renameScope(oldName, newName, {
      refactor,
      deprecate,
      preserve,
      skipDependencyInstallation,
    });
    const renameOutput = renameScopeOutput(result);
    return joinSections([formatSuccessSummary(`replaced "${oldName}" scope with "${newName}"`), renameOutput]);
  }
}

export function renameScopeOutput(renameResult: RenameResult): string {
  const { renameData, refactoredIds } = renameResult;
  const renamedSection = renameData.length
    ? [
        formatTitle(`affected components (${renameData.length})`),
        ...renameData.map((item) =>
          formatItem(
            `${item.sourceId.toStringWithoutVersion()} ${item.isTagged ? '(deprecated) ' : ''}-> ${item.targetId.toString()}`
          )
        ),
      ].join('\n')
    : '';
  const refactoredSection = refactoredIds.length
    ? [
        formatTitle(`refactored components (${refactoredIds.length})`),
        ...refactoredIds.map((id) => formatItem(id.toString())),
      ].join('\n')
    : '';
  return joinSections([renamedSection, refactoredSection]);
}
