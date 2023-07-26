## create bundle:

```
node node_modules/@teambit/bit/dist/bundle/bundle.js > bundle.result.json
```

## Use the bundle

```
node <path to repo>/bit/bundle/bit.app.js
```

## structure

1. generate-npmrc.ts - generate an npmrc file with the bit registry
   (so you can install external packages with regular pcaakge manager)
1. create-package-json.ts - generate a package.json file with all external packages
1. bundle.ts - main file to generate the bundle
1. esbuild.ts - running the esbuild bundler
1. generate-core-aspects-exports - This will generate a file that exports all the core aspects
