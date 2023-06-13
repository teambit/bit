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

  // kind of a hack, but couldn't find a better way to do it. for types components, seems like the mainFile is empty
  if (template.includes('{main}.js') && mainFile?.endsWith('.d.ts')) {
    return '';
  }

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

export function getMainFileWithoutExtension(mainFile: string) {
  return mainFile.replace(new RegExp(`${path.extname(mainFile)}$`), ''); // makes sure it's the last occurrence
}

function replaceSlashesWithDots(name: string) {
  const allSlashes = new RegExp('/', 'g');
  return name.replace(allSlashes, '.');
}
