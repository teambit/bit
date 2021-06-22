// import { RenderingContext } from '@teambit/preview';
// import { StandaloneNotFoundPage } from '@teambit/design.ui.pages.standalone-not-found-page';
import { HtmlAspect } from './html.aspect';
import { HtmlComponent, defaultHtmlComponent } from './html-component-model';
import { HtmlComposition, HtmlFunctionComposition } from './interfaces';
import { createElementFromString } from './utils';



// function wrap(Component: ComponentType, WrapperComponent?: ComponentType): ComponentType {
//   function Wrapper({ children }: { children?: ReactNode }) {
//     if (!WrapperComponent) return <Component>{children}</Component>;

//     return (
//       <WrapperComponent>
//         <Component>{children}</Component>
//       </WrapperComponent>
//     );
//   }

//   return Wrapper;
// }

function ensureRootElementInBody(){
  const root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);
  return root;
}

const root = document.getElementById('root') || ensureRootElementInBody();

/**
 * HOC to wrap and mount all registered providers into the DOM.
 * TODO implement for regular html providers/wrappers
 */
export function withProviders() {
  return `<div></div>`
}

export function renderTemplate(root: HTMLElement, template: string) {
  root.appendChild(createElementFromString(template));
}


/**
 * this mounts compositions into the DOM in the component preview.
 * this function can be overridden through ReactAspect.overrideCompositionsMounter() API
 * to apply custom logic for component DOM mounting.
 */
export default (composition: HtmlComposition) => {
  // first clear the root node from any previous compositions. Required as all compositions
  // of a specific component are rendered in the same iframe
  root.innerHTML = '';
  
  if (composition instanceof Element || composition instanceof HTMLDocument){
    root.appendChild(composition);
    return;
  }

  switch(typeof composition){
    case 'function':
      composition(root);
      return;
    case 'string':
      renderTemplate(root, composition);
      return;
    default:
      return; // TODO error "this type of composition is not supported by the html env"

  }
};