import { ComponentDocs } from './docs.extension';
import { toIdentifier } from '../utils/to-identifier';

export function generateLink(components: ComponentDocs[], templatePath: string) {
  return `
import { addDocs } from './docs.preview';
import harmony from '@teambit/harmony';
import templateFn from '${templatePath}';

${components
  .map(componentDocs => {
    return `const ${toIdentifier(componentDocs.component.id.name)} = require('${componentDocs.files[0]}');\n`;
  })
  .join('')}


addDocs(templateFn, {
${components
  .map(
    componentDocs => `'${componentDocs.component.id.toString()}':${toIdentifier(componentDocs.component.id.name)},\n`
  )
  .join('')}
});  
`;
}
