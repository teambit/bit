/** @flow */
export default function toResultObject() { 
  return (promise) => {
    return promise
      .then(result => ({ success: true, result }))
      .catch(error => ({ success: false, error }));
  };
}
