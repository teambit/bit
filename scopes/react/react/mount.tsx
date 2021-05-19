import React, { ComponentType, ReactNode } from 'react';
import ReactDOM from 'react-dom';
import { RenderingContext } from '@teambit/preview';
import { StandaloneNotFoundPage } from '@teambit/design.ui.pages.standalone-not-found-page';
import { ReactAspect } from './react.aspect';

function wrap(Component: ComponentType, WrapperComponent?: ComponentType): ComponentType {
  function Wrapper({ children }: { children?: ReactNode }) {
    if (!WrapperComponent) return <Component>{children}</Component>;

    return (
      <WrapperComponent>
        <Component>{children}</Component>
      </WrapperComponent>
    );
  }

  return Wrapper;
}

/**
 * HOC to wrap and mount all registered providers into the DOM.
 */
export function withProviders(providers: ComponentType[] = []) {
  return providers.reduce<ComponentType>(
    (MainProvider, Provider) => {
      if (!MainProvider) return wrap(Provider);
      return wrap(Provider, MainProvider);
    },
    ({ children }) => <div>{children}</div>
  );
}

/**
 * this mounts compositions into the DOM in the component preview.
 * this function can be overridden through ReactAspect.overrideCompositionsMounter() API
 * to apply custom logic for component DOM mounting.
 */
export default (Composition: React.ComponentType = StandaloneNotFoundPage, previewContext: RenderingContext) => {
  const reactContext = previewContext.get(ReactAspect.id);
  const Provider = withProviders(reactContext?.providers);
  ReactDOM.render(
    <Provider>
      <Composition />
    </Provider>,
    document.getElementById('root')
  );
};
