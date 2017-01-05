/** @flow */
export type ResultObject = {
  success: boolean,
  val: any,
  error: Error
};

export default function toResultObject() { 
  return (promise: Promise<any>): Promise<ResultObject> => {
    return promise
      .then(val => ({ success: true, val }))
      .catch(error => ({ success: false, error, val: null }));
  };
}
