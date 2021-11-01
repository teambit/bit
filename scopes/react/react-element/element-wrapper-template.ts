import { ElementsWrapperContext, ElementsWrapperFn } from '@teambit/elements';
import decamelize from 'decamelize';

export type GetWrapperOpts = {
  elementsPrefix: string;
};

export function getWrapperTemplateFn({ elementsPrefix = 'x' }: GetWrapperOpts) {
  const wrapperTemplateFn: ElementsWrapperFn = (context: ElementsWrapperContext) => {
    const kababName = decamelize(context.componentName);
    const elementName = elementsPrefix ? `${elementsPrefix}-${kababName}` : kababName;
    return `import * as Component from '${context.mainFilePath}';
import ReactDOM from 'react-dom';
    class ${context.componentName} extends HTMLElement {
  connectedCallback() {
    const mountPoint = document.createElement('span');
    this.attachShadow({ mode: 'open' }).appendChild(mountPoint);

    const name = this.getAttribute('name');
    const url = 'https://www.google.com/search?q=' + encodeURIComponent(name);
    ReactDOM.render(<Component>{name}</Component>, mountPoint);
  }
}
customElements.define('${elementName}', ${context.componentName});`;
  };
  return wrapperTemplateFn;
}
