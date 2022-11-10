import { BuildTask } from "@teambit/builder";

export class Pipeline {
  constructor(
    private tasks: BuildTask
  ) {}

  static from() {
    return new Pipeline();
  }
}
