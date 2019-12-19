export interface PipeOptions {
  bail: boolean;
  keep: boolean;
}

export interface RunOptions extends PipeOptions {
  id?: string;
  step?: string;
  extensions: string[];
}
