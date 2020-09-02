import { Component } from '@teambit/component';

export type ExtensionData = {
  [key: string]: any;
};

export type OnComponentLoad = (component: Component) => Promise<ExtensionData>;
