export function mockRoute() {
  return {
    relativePath: `mock-route.ts`,
    content: `import type { RouteDefinition } from './route';

export function getMockRoute(): RouteDefinition {
  return {
    method: 'get',
    route: '/',
    callback: (req, res) => res.send('hello world')
  }
}
`,
  };
}
