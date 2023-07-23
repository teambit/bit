## create bundle:

```
node node_modules/@teambit/bit/dist/bundle/bundle.js > bundle.result.json
```

## Use the bundle

```
node <path to repo>/bit/bundle/bit.app.js
```

## structure

1. bundle.ts - main file to generate the bundle
2. esbuild.ts - running the esbuild bundler
3. generate-core-aspects-exports - This will generate a file that exports all the core aspects
