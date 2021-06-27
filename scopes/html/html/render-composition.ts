import { renderTemplate } from '@teambit/html.modules.render-template';
import { HtmlComposition } from './interfaces';

/**
 * this mounts compositions into the DOM in the component preview.
 * this function can be overridden through ReactAspect.overrideCompositionsMounter() API
 * to apply custom logic for component DOM mounting.
 */
export const RenderHtmlComposition = (target: HTMLElement | null, composition: HtmlComposition) => {
  if (!target) return undefined;

  // first clear the root node from any previous compositions. Required as all compositions
  // of a specific component are rendered in the same iframe
  target.innerHTML = '';

  if (composition instanceof Element || composition instanceof HTMLDocument) {
    target.appendChild(composition);
    return undefined;
  }

  switch (typeof composition) {
    case 'function':
      composition(target);
      return undefined;
    case 'string':
      renderTemplate(target, composition);
      return undefined;
    default:
      return undefined; // TODO error "this type of composition is not supported by the html env"
  }
};
