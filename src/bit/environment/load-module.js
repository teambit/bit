/** @Flow */
export default (moduleName) => {
  return new Promise((resolve, reject) => {
    try {
      const module = require(moduleName);
      return resolve(module);
    } catch (e) {
      return reject(e);
    }
  });
};
