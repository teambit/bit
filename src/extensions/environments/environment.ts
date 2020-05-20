import { Component } from '../component';
import { Workspace } from '../workspace';

export interface Environment {
  dev(workspace: Workspace, components: Component[]): void;
  // build(): void;
  // serve(): void;
  // release(): void;
  // lint(): void;
}
