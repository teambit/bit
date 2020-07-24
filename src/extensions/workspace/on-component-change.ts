import { Component } from '../component';

export type OnComponentChangeResult = { results: any; toString: () => string };

export type OnComponentChange = (component: Component) => Promise<OnComponentChangeResult>;
