import { Component } from '../component';

export type OnComponentChangeOptions = { noCache?: boolean; verbose?: boolean };

export type OnComponentChange = (component: Component, options: OnComponentChangeOptions) => Promise<any>;
