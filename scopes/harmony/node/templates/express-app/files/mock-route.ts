export function mockRoute() {
  return {
    relativePath: `mock-route.ts`,
    content: `import type { Route } from './route';

export function getMockRoute(): Route {
  return {
    method: 'get',
    route: '/',
    middlewares: [async (req, res) => res.send('hello world')]
  }
}
`,
  };
}
