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

## binary

1. node --experimental-sea-config sea-config.json
1. cp $(command -v node) bit-app
1. codesign --remove-signature bit-app
1. npx postject bit-app NODE_SEA_BLOB bit.app.blob \
   --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
   --macho-segment-name NODE_SEA
1. codesign --sign - bit-app

## binary script

```
node --experimental-sea-config sea-config.json
cp $(command -v node) bit-app
codesign --remove-signature bit-app
npx postject bit-app NODE_SEA_BLOB bit.app.blob \
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
    --macho-segment-name NODE_SEA
codesign --sign - bit-app
```
