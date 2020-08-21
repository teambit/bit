import { Component } from '../component';

export type ExtensionData = {
  [key: string]: any;
};

export type OnComponentLoad = (component: Component) => Promise<ExtensionData>;
