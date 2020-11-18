import { CSSProperties, ComponentType } from 'react';

export type CompositionsModule = Record<string, CompositionType>;
export type CompositionType<P = {}> = ComponentType<P> & {
  canvas?: CSSProperties;
};
