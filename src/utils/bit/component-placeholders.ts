import format from 'string-format';
import path from 'path';
import ConsumerComponent from '../../consumer/component';

/**
 * search for placeholders, such as {main}, {name} in a template and replace them with the values
 * from the component
 */
export function replacePlaceHolderWithComponentValue<T>(component: ConsumerComponent, template: T): T {
  if (typeof template !== 'string') return template;
  const values = {
    main: () => getMainFileWithoutExtension(component.mainFile),
    name: component.name,
    scope: component.scope
  };
  return format(template, values);
}

function getMainFileWithoutExtension(mainFile: string) {
  return mainFile.replace(new RegExp(`${path.extname(mainFile)}$`), ''); // makes sure it's the last occurrence
}
