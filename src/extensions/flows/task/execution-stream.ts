import { Exec } from '@teambit/capsule';

export class ExecutionStream {
  constructor(private exec: Exec, private startTime?: Date) {}
}
