// import { RenderingContext } from '@teambit/preview';
// import { StandaloneNotFoundPage } from '@teambit/design.ui.pages.standalone-not-found-page';
import { HtmlAspect } from './html.aspect';
import { RenderHtmlComposition } from './render-composition';
import { HtmlComposition } from './interfaces';

// TODO implement wrapping for providers with html env
// function wrap(Component: ComponentType, WrapperComponent?: ComponentType): ComponentType {
//   function Wrapper({ children }: { children?: ReactNode }) {

//   return Wrapper;
// }

/**
 * HOC to wrap and mount all registered providers into the DOM.
 * TODO implement for regular html providers/wrappers with wrap function above
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

export default function mountHtmlComposition (composition: HtmlComposition){
  const root = getRoot();
  RenderHtmlComposition(root, composition);
} 
