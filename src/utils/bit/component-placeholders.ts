import path from 'path';
import format from 'string-format';

import ConsumerComponent from '../../consumer/component';

/**
 * search for placeholders, such as {main}, {name} in a template and replace them with the values
 * from the component with some manipulations
 */
export function replacePlaceHolderWithComponentValue<T>(component: ConsumerComponent, template: T): T {
  if (typeof template !== 'string') return template;
  // TODO: consider support scopeId, owner and scope here
  const values = {
    main: () => getMainFileWithoutExtension(component.mainFile),
    name: () => replaceSlashesWithDots(component.name),
    scope: () => component.scope,
  };
  return format(template, values);
}

export function replacePlaceHolderForPackageName(
  {
    name,
    scope,
    scopeId,
    owner,
  }: { name: string; scope?: string | null; scopeId?: string | null; owner?: string | null },
  template: string
): string {
  const values = {
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
