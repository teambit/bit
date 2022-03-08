import { ElementsWrapperContext, ElementsWrapperFn } from '@teambit/elements';
import { toWindowsCompatiblePath } from '@teambit/toolbox.path.to-windows-compatible-path';

import decamelize from 'decamelize';

export type GetWrapperOpts = {
  elementsPrefix: string;
};

export function getWrapperTemplateFn({ elementsPrefix = 'x' }: GetWrapperOpts) {
  const wrapperTemplateFn: ElementsWrapperFn = (context: ElementsWrapperContext) => {
    const kababName = decamelize(context.componentName);
    const elementName = elementsPrefix ? `${elementsPrefix}-${kababName}` : kababName;
    return `import React from 'react';
import ReactDOM from 'react-dom';
import Component from '${toWindowsCompatiblePath(context.mainFilePath)}';
class ${context.componentName} extends HTMLElement {
  connectedCallback() {
    const mountPoint = document.createElement('span');
    this.attachShadow({ mode: 'open' }).appendChild(mountPoint);
    const el = this;
    const props = this.getAttributeNames().reduce((acc, curr) => {
      acc[curr] = el.getAttribute(curr);
      return acc;
    }, {})
    ReactDOM.render(<Component {...props}></Component>, mountPoint);
  }
}
customElements.define('${elementName}', ${context.componentName});`;
  };
  return wrapperTemplateFn;
}
