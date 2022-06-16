export function getPort() {
  return {
    relativePath: `get-port.ts`,
    content: `export async function getPort() {
  if (process.env.PORT){
    return process.env.PORT;
  }
  const myArgs = process.argv.slice(2);
  return myArgs[0] || 3000;
}
`,
  };
}
