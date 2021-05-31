import path from 'path';
import format from 'string-format';

/**
 * search for placeholders, such as {main}, {name} in a template and replace them with the values
 * from the component with some manipulations
 */
export function replacePlaceHolderForPackageValue(
  {
    mainFile,
    name,
    scope,
    scopeId,
    owner,
  }: { mainFile?: string | null; name: string; scope?: string | null; scopeId?: string | null; owner?: string | null },
  template: string
): string {
  if (typeof template !== 'string') return template;

  const values = {
    main: () => (mainFile ? getMainFileWithoutExtension(mainFile) : mainFile),
    name: () => replaceSlashesWithDots(name),
    scope: () => scope,
    scopeId: () => scopeId,
    owner: () => owner,
  };
  const res = format(template, values);
  return res;
}

function getMainFileWithoutExtension(mainFile: string) {
  return mainFile.replace(new RegExp(`${path.extname(mainFile)}$`), ''); // makes sure it's the last occurrence
}

function replaceSlashesWithDots(name: string) {
  const allSlashes = new RegExp('/', 'g');
  return name.replace(allSlashes, '.');
}
