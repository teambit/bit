import { WorkspaceContext } from '@teambit/generator';

export function launchJson({ defaultScope }: WorkspaceContext) {
  const scopedRegistry = defaultScope ? `@${defaultScope.split('.')[0]}` : '@my-org';
  return `{
  // Use IntelliSense to learn about possible attributes.
  // Hover to view descriptions of existing attributes.
  // For more information, visit: https://go.microsoft.com/fwlink/?linkid=830387
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "test",
      "program": "\${workspaceFolder}/node_modules/@teambit/bit/dist/app.js",
      "args": ["test"],
      "resolveSourceMapLocations": [
        "\${workspaceFolder}/node_modules/${scopedRegistry}/**/*.js"
      ],
      "outFiles": [
        "\${workspaceFolder}/node_modules/${scopedRegistry}/**/*.js"
      ],
      "console": "integratedTerminal",
      "sourceMaps": true,
      "internalConsoleOptions": "neverOpen",
      "cwd": "\${workspaceFolder}"
    }
  ]
}`;
}
