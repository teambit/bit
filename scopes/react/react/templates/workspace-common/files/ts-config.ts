export const tsConfig = `{
  "extends": "./node_modules/@teambit/react/typescript/tsconfig.json",
  "include": ["src", "types"],
  "compilerOptions": {
    "noEmit": true
  },
  "exclude": [
    "dist"
  ]
}`;
