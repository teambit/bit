module.exports = {
  name: 'gulp-ts',
  dependencies: [],
  provider
};

async function provider() {
  const defineCompiler = () => ({ taskFile: 'transpile' });
  return { defineCompiler };
}
