// Simulates the cost of parsing/evaluating a fat domain module
// (the way a real `.main.runtime.ts` does today by importing 30+ deps).
const start = Date.now();
const buf = [];
while (Date.now() - start < 35) buf.push(Math.random().toString(36));

export function listComponents() {
  return ['button', 'card', 'header', 'footer', 'nav'];
}
