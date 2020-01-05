import { Workspace } from '../workspace';
import { Pipes } from '.';

export type PipeConfig = {};

export type PipesDeps = [Workspace];

export type PipesConfig = {
  pipes: { [key: string]: Pipe };
};

export default function providePipes(config: PipeConfig, [workspace]: PipesDeps) {
  return new Pipes();
}
