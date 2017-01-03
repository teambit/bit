/** @flow */
export default function toResultObject() { 
  return (promise) => {
    return promise
      .then(val => ({ success: true, val }))
      .catch(error => ({ success: false, error, val: null }));
  };
}
