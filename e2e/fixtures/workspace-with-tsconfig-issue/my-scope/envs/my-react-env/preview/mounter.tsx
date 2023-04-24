import React from 'react';
import { createMounter } from '@teambit/react.mounter';

/**
 * provide your component compositions (preview) with the context they need to run.
 * for example, a router, a theme, a data provider, etc.
 * components added here as providers, should be listed as host-dependencies in your host-dependencies.ts file.
 * @see https://bit.dev/docs/react-env/component-previews#composition-providers
 */
export function MyReactProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/**
 * the entry for the app (preview runtime) that renders your component previews.
 * use the default template or create your own.
 * @see https://docs/react-env/component-previews#composition-mounter
 */
export default createMounter(MyReactProvider) as any;
