import { domToReact } from '@teambit/modules.dom-to-react';
import { ComponentID } from '@teambit/component-id';

export type ComponentHighlighterOptions = {
  /**
   * determine the border color of all component highlights.
   */
  borderColor: string;

  /**
   * determine the text color of the component highlight information.
   */
  textColor: string;
};

export function highlightComponents(options: Partial<ComponentHighlighterOptions> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const opts = getOptions(options);
  document.addEventListener('mouseover', (e) => {
    const element = document.elementFromPoint(e.clientX, e.clientY);
    if (!element) return;
    const component = domToReact(element);
    if (!component || !component.componentId) return;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const id = ComponentID.fromString(component.componentId);
    // TODO: @kutner please continue from here.
    // element.style.border = `thick solid ${opts.borderColor}`;
    // console.log(id, element);
  });
}

const defaultOptions = {
  borderColor: 'navy',
  textColor: 'black',
};

function getOptions(targetOpts: Partial<ComponentHighlighterOptions>) {
  return Object.assign({}, defaultOptions, targetOpts);
}
