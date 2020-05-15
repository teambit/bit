module.exports = {
  name: 'typescript',
  dependencies: [],
  provider
};

async function provider() {
  const defineCompiler = () => ({ taskFile: 'transpile' });
  return { defineCompiler };
}
