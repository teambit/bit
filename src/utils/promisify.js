/** @flow */

export default function promisify(fn: (...args: any[]) => any) {
  return (...args: any[]): Promise<any> => {
    return new Promise((resolve, reject) => {
      fn(...args, (err, res) => {
        if (err) return reject(err);
        return resolve(res);
      });
    });
  };
}
