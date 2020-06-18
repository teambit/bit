import { Component } from '../component';

function docsData(component: Component): { filepath?: string } {
  return component.state.store.findExtension('@teambit/docs')?.data || {};
}

function toIdentifier(name: string) {
  return name.replace('/', '$');
}

export function docsTemplate(components: Component[]) {
  const withDocs = components.filter(component => docsData(component).filepath);
  return `import { addDocs } from '../docs';
${withDocs
  .map(component => {
    return `import ${toIdentifier(component.id.name)} from '${docsData(component).filepath}';\n`;
  })
  .join('')}

addDocs([
${withDocs.map(component => `${toIdentifier(component.id.name)},\n`).join('')}
]);
`;
}
