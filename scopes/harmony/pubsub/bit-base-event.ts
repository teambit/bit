export class BitBaseEvent<T> {
  constructor(readonly type: string, readonly version: string, readonly timestamp: number, readonly data: T) {}
}
