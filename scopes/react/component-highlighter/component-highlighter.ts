import { domToReact } from '@teambit/modules.dom-to-react';
import { ComponentID } from '@teambit/component-id';

export function initiate() {
  document.addEventListener('mouseover', (e) => {
    const element = document.elementFromPoint(e.clientX, e.clientY);
    if (!element) return;
    const component = domToReact(element);
    if (!component || !component.componentId) return;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const id = ComponentID.fromString(component.componentId);
    // TODO: @kutner please continue from here.
    // element.style.border = 'thick solid navy';
    // console.log(id, element);
  });
}
