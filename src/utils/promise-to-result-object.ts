export type ResultObject<T> = {
  success: boolean;
  val: T | null | undefined;
  error: Error;
};

export default function toResultObject<T>() {
  return (promise: Promise<any>): Promise<ResultObject<T>> => {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return promise.then((val) => ({ success: true, val })).catch((error) => ({ success: false, error, val: null }));
  };
}
