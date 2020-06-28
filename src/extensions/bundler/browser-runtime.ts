import { Component } from '../component';

export type BrowserRuntime = {
  entry: (components: Component[]) => string[];
};
