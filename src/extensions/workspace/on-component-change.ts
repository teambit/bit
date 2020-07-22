import { Component } from '../component';

export type OnComponentChangeOptions = { noCache?: boolean; verbose?: boolean };

export type OnComponentChangeResult = { results: any; toString: () => string };

export type OnComponentChange = (
  component: Component,
  options: OnComponentChangeOptions
) => Promise<OnComponentChangeResult>;
