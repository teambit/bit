// import { RenderingContext } from '@teambit/preview';
// import { StandaloneNotFoundPage } from '@teambit/design.ui.pages.standalone-not-found-page';
import { HtmlAspect } from './html.aspect';
import { RenderHtmlComposition } from './utils';
import { HtmlComposition } from './interfaces';

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


/**
 * HOC to wrap and mount all registered providers into the DOM.
 * TODO implement for regular html providers/wrappers
 */
export function withProviders() {
  return `<div></div>`
}

function ensureRootElementInBody() {
  const root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);
  return root;
}

const getRoot = () => document.getElementById('root') || ensureRootElementInBody();

export default (composition: HtmlComposition) => {
  const root = getRoot();
  RenderHtmlComposition(root, composition);
} 
