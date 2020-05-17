import { Component } from '../component';

export interface Environment {
  dev(components: Component[]): void;
  // build(): void;
  // serve(): void;
  // release(): void;
  // lint(): void;
}
