/**
 * interface used to consolidate one type of various functions across
 * the system which requires a serializable object.
 */
export type Serializable =
  | string
  | {
      /**
       * serialize the object into a string.
       */
      toString(): string;
    };

export type SerializableMap = {
  [key: string]: Serializable;
};
