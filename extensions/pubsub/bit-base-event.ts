<<<<<<< HEAD
export type BitBaseEvent = {
  readonly type: string;
  readonly version: string;
  readonly timestamp: string;
  readonly body: object;
};
=======
export class BitBaseEvent<T> {
  constructor(readonly type: string, readonly version: string, readonly timestamp: string, readonly data: T) {}
}
>>>>>>> master
