import { Component } from '@teambit/component';

export type OnComponentAddResult = { results: any; toString: () => string };

export type OnComponentAdd = (component: Component) => Promise<OnComponentAddResult>;
