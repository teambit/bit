/**
 * @bit
 */
export default function resolveBoolean(resolve, reject) {
  return (err) => {
    if (err) return reject(err);
    return resolve(true);
  };
}
