// import { RenderingContext } from '@teambit/preview';
// import { StandaloneNotFoundPage } from '@teambit/design.ui.pages.standalone-not-found-page';
import { HtmlAspect } from './html.aspect';
import { HtmlComponent, defaultHtmlComponent } from './html-component-model';



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

/**
 * this mounts compositions into the DOM in the component preview.
 * this function can be overridden through ReactAspect.overrideCompositionsMounter() API
 * to apply custom logic for component DOM mounting.
 */
export default (CompositionHtml: () => HtmlComponent = () => defaultHtmlComponent) => {
  // const nodeContext = previewContext.get(NodeAspect.id);
  const { template, js, css} = CompositionHtml();
  const root = document.getElementById('root');

  const htmlFragment = document.createRange().createContextualFragment(template);

  root?.appendChild(htmlFragment);

};