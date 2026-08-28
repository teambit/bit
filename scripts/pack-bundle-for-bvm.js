#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Turn a built bundle distribution into a tar file that `bvm install` can consume, so a branch can
 * be handed out without publishing anything to the registry.
 *
 *   node scripts/pack-bundle-for-bvm.js --capsule <dir> --version 2.2.11-bundle.1
 *
 * `<dir>` is either `npm run bundle --out-dir`'s output or the capsule `bit build` writes for
 * `teambit.harmony/bit` - since §9e the bundler emits the published package shape either way, so
 * both are already `@teambit/bit` as it would be published: bundle, shims, locators, UI/preview
 * pre-bundle, and a package.json whose dependencies are the externals alone. Nothing here rebuilds
 * or rearranges it; it is packed, the externals are installed next to it, and the result is tarred
 * in the layout bvm extracts into `~/.bvm/versions`:
 *
 *   bit-<version>/
 *   └── node_modules/
 *       ├── @teambit/bit/…      ← `npm pack` of the distribution
 *       └── <externals>/…       ← `pnpm install`, hoisted
 *
 * That layout is the whole contract with bvm: it reads `bvm.node` and `bin` out of
 * `node_modules/@teambit/bit/package.json` and links `node_modules/@teambit/bit/bin/bit`.
 *
 * Note that bvm's tar install runs no package manager of its own - whatever the tar holds is the
 * installation. So the externals are installed *before* `@teambit/bit` is placed next to them: a
 * pnpm run afterwards would prune it as extraneous, which is also why the staging `package.json`
 * and lockfile are excluded from the tar (the same exclusions CI's `compress_bit` uses).
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const argv = process.argv.slice(2);

const take = (flag, fallback) => {
  const i = argv.indexOf(flag);
  if (i === -1) return fallback;
  const value = argv[i + 1];
  argv.splice(i, 2);
  return value;
};
const takeBool = (flag) => {
  const i = argv.indexOf(flag);
  if (i === -1) return false;
  argv.splice(i, 1);
  return true;
};

/** bvm's own os names, which are not node's - see `OS_TYPES` in `@teambit/bvm.list`. */
const BVM_OS = { darwin: 'darwin', linux: 'linux', win32: 'win' };
/** ...and pnpm's, which are node's. */
const PNPM_OS = { darwin: 'darwin', linux: 'linux', win: 'win32' };

/**
 * The pre-bundled UI and preview browser assets. `bit start` serves these instead of running a
 * bundler, so a tar without them produces a bit that installs and runs but cannot start. They are
 * copied into the shims by the bundler, which is why they only exist after a build that ran
 * `BundleUI` and `PreBundlePreview` before `BundleCliApp`.
 */
const REQUIRED_IN_CAPSULE = [
  'bin/bit',
  'dist/core-aspects/bundle/bit.app.js',
  // The `.hash` gate files, not the directories around them: `bit start` reads these to decide a
  // pre-bundle exists at all, so a tree without them is one it ignores and tries to rebuild. Both
  // tasks write `<artifacts>/ui-bundle/.hash` (BundleUiTask.generateHash, generateBundleHash).
  // Note the UI's is a single file for both roots - the two are one rspack compilation now, so
  // there are no per-root `ui-bundle/{workspace,scope}/` directories to look for.
  'dist/core-aspects/node_modules/@teambit/ui/artifacts/ui-bundle/.hash',
  'dist/core-aspects/node_modules/@teambit/preview/artifacts/ui-bundle/.hash',
];

/** what the artifacts trees actually hold, so a missing-artifact failure says more than "missing" */
function describeArtifacts(rootDir) {
  const lines = [];
  for (const pkg of ['ui', 'preview']) {
    const dir = path.join(rootDir, 'dist/core-aspects/node_modules/@teambit', pkg, 'artifacts/ui-bundle');
    if (!fs.existsSync(dir)) {
      lines.push(`  @teambit/${pkg}: no artifacts/ui-bundle at all`);
      continue;
    }
    lines.push(`  @teambit/${pkg}: ${fs.readdirSync(dir).slice(0, 12).join(' ') || '(empty)'}`);
  }
  return lines.join('\n');
}

/**
 * The two shapes this accepts. The capsule is `@teambit/bit` itself (the bundler builds the
 * published shape in place, §9e). `npm run bundle --out-dir` emits the identical tree - same
 * `bin/bit`, same `dist/core-aspects/{bundle,node_modules}` - but generates a stand-in manifest
 * for the externals rather than the real package identity, which `normalise` below restores.
 */
const SOURCE_PACKAGE_NAMES = ['@teambit/bit', '@teambit/bit-bundle-externals'];

function fail(message) {
  console.error(`[pack-for-bvm] ${message}`);
  process.exit(1);
}

/** depth-first search for `teambit.pkg/pkg`.packageJson.bvm.node, wherever the variant lives */
function findBvmNode(node) {
  if (!node || typeof node !== 'object') return undefined;
  const pkg = node['teambit.pkg/pkg'];
  const fromHere = pkg && pkg.packageJson && pkg.packageJson.bvm && pkg.packageJson.bvm.node;
  if (fromHere) return fromHere;
  for (const value of Object.values(node)) {
    const found = findBvmNode(value);
    if (found) return found;
  }
  return undefined;
}

/**
 * The Node.js bvm runs the CLI with. bvm reads it from `bvm.node` in the installed
 * `@teambit/bit/package.json` and refuses to link without it, so it has to be right.
 */
function resolveNodeVersion(manifest, explicit) {
  if (explicit) return explicit;
  if (manifest.bvm && manifest.bvm.node) return manifest.bvm.node;
  // `npm run bundle`'s manifest has no identity fields; workspace.jsonc is where the real
  // published package.json gets `bvm.node` from, so it is the same value the capsule would carry.
  const workspacePath = path.join(path.resolve(__dirname, '..'), 'workspace.jsonc');
  try {
    // eslint-disable-next-line import/no-extraneous-dependencies, global-require
    const { parse } = require('comment-json');
    const fromWorkspace = findBvmNode(parse(fs.readFileSync(workspacePath, 'utf8')));
    if (fromWorkspace) return fromWorkspace;
  } catch (err) {
    fail(`could not read bvm.node from ${workspacePath} (${err.message}) - pass --node-version`);
  }
  return fail(`no bvm.node in the manifest or ${workspacePath} - pass --node-version`);
}

function run(command, args, opts = {}) {
  return execFileSync(command, args, { stdio: 'inherit', ...opts });
}

/**
 * Locate the capsule `bit build` wrote for a component. Capsule dir basenames are
 * `<componentId with "/" -> "_">@<version>` - the same lookup `prebundle-cache.ts` does, and for
 * the same reason: `bit build` writes nothing under the repo, so the capsule list is the only way
 * to find its output.
 *
 * The bit binary must be the SAME one the build ran with; a bvm-linked release binary resolves
 * core aspects to its own published packages rather than to this branch's source.
 */
function findCapsuleDir(bitBin, componentId) {
  // the repo's dev binary is a .js file; it carries a shebang, but running it through node works
  // whether or not the executable bit survived however the caller got hold of it.
  const listArgs = ['capsule', 'list', '--json'];
  const [command, args] = bitBin.endsWith('.js') ? [process.execPath, [bitBin, ...listArgs]] : [bitBin, listArgs];
  let raw;
  try {
    raw = execFileSync(command, args, { maxBuffer: 32 * 1024 * 1024 }).toString();
  } catch (err) {
    fail(`"${bitBin} capsule list --json" failed: ${err.message}`);
  }
  let list;
  try {
    list = JSON.parse(raw);
  } catch (err) {
    fail(`could not parse "${bitBin} capsule list --json": ${err.message}`);
  }
  const prefix = `${componentId.replace(/\//g, '_')}@`;
  const found = (list.capsules || []).find((capsulePath) => (capsulePath.split('/').pop() || '').startsWith(prefix));
  if (!found) fail(`no capsule for "${componentId}" - run the build first (see --help output above)`);
  return found;
}

/**
 * Native addons are per-platform optional dependencies, so they are the one thing a cross-platform
 * pack can get silently wrong: pnpm resolves the host's binary, or none at all, and the tar builds
 * clean and then fails at runtime on the target. `@pnpm/napi` is the one CI already guards
 * (`verify_pnpm_napi_bundle`) and the one bit cannot start without.
 */
function verifyNativeBinaries(innerDir, externals, pnpmOsName, targetArch) {
  if (!externals['@pnpm/napi']) return;
  const packageName = `napi.${pnpmOsName}-${targetArch}`;
  const candidates = [
    path.join(innerDir, 'node_modules', '@pnpm', packageName, 'pnpm-napi.node'),
    path.join(innerDir, 'node_modules', '.pnpm', 'node_modules', '@pnpm', packageName, 'pnpm-napi.node'),
  ];
  if (!candidates.some((candidate) => fs.existsSync(candidate))) {
    fail(
      `@pnpm/${packageName}'s native binary is missing - the tar would install and then fail to run ` +
        `on ${pnpmOsName}-${targetArch}. pnpm did not resolve the target platform's optional dependency.`
    );
  }
  console.log(`[pack-for-bvm] verified @pnpm/${packageName}`);
}

function isValidSemver(version) {
  // the same shape bvm validates with; kept as a regex so the script has no dependencies
  return /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(version);
}

function main() {
  const capsule = take('--capsule');
  const capsuleOf = take('--capsule-of');
  const bitBin = take('--bit-bin', process.env.BIT_BIN || 'bit');
  const version = take('--version');
  const outDir = path.resolve(take('--out-dir', path.join(os.tmpdir(), 'bit-bvm-tar')));
  const targetOs = take('--os', BVM_OS[process.platform]);
  const targetArch = take('--arch', process.arch);
  const registry = take('--registry');
  const explicitNodeVersion = take('--node-version');
  const keepStaging = takeBool('--keep-staging');

  if (argv.length) fail(`unknown argument(s): ${argv.join(' ')}`);
  if (!capsule && !capsuleOf) fail('missing --capsule <dir> or --capsule-of <component-id>');
  if (capsule && capsuleOf) fail('--capsule and --capsule-of are mutually exclusive');
  if (!version) fail('missing --version <semver>');
  if (!isValidSemver(version)) fail(`--version "${version}" is not a valid semver`);
  if (!BVM_OS[PNPM_OS[targetOs]]) fail(`--os must be one of ${Object.values(BVM_OS).join(', ')}`);
  if (!['x64', 'arm64'].includes(targetArch)) fail('--arch must be x64 or arm64');

  const capsuleDir = capsule ? path.resolve(capsule) : findCapsuleDir(bitBin, capsuleOf);
  if (capsuleOf) console.log(`[pack-for-bvm] capsule: ${capsuleDir}`);
  const manifestPath = path.join(capsuleDir, 'package.json');
  if (!fs.existsSync(manifestPath)) fail(`no package.json in ${capsuleDir} - is that the capsule?`);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!SOURCE_PACKAGE_NAMES.includes(manifest.name)) {
    fail(`${capsuleDir} is "${manifest.name}", expected one of ${SOURCE_PACKAGE_NAMES.join(', ')}`);
  }
  const nodeVersion = resolveNodeVersion(manifest, explicitNodeVersion);

  const missing = REQUIRED_IN_CAPSULE.filter((entry) => !fs.existsSync(path.join(capsuleDir, entry)));
  if (missing.length) {
    fail(
      `${capsuleDir} is missing:\n  ${missing.join('\n  ')}\n` +
        `what the artifacts trees hold:\n${describeArtifacts(capsuleDir)}\n` +
        'the UI/preview pre-bundle has to exist before the bundle is built:\n' +
        '  bit build "teambit.ui-foundation/ui, teambit.preview/preview" --reuse-capsules --tasks "BundleUI,PreBundlePreview"\n' +
        '  BIT_BIN=bd npm run bundle:prebundle-cache:save && npm run bundle:prebundle-cache:restore\n' +
        '  npm run bundle:ensure -- --out-dir <dir>'
    );
  }

  const externals = manifest.dependencies || {};
  if (!Object.keys(externals).length) fail('the capsule package.json declares no dependencies - the externals are missing');

  const stagingRoot = path.join(outDir, 'staging');
  const innerDirName = `bit-${version}`;
  const innerDir = path.join(stagingRoot, innerDirName);
  fs.rmSync(stagingRoot, { recursive: true, force: true });
  fs.mkdirSync(innerDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`[pack-for-bvm] version ${version}, target ${targetOs}-${targetArch}`);
  console.log(`[pack-for-bvm] externals: ${Object.keys(externals).join(', ')}`);

  // 1. install the externals. this has to happen first: pnpm reconciles node_modules against the
  //    manifest, so running it after @teambit/bit is in place would delete it again.
  const stagingManifest = {
    name: 'bit-bvm-distribution',
    version: '0.0.0',
    private: true,
    dependencies: externals,
  };
  fs.writeFileSync(path.join(innerDir, 'package.json'), `${JSON.stringify(stagingManifest, null, 2)}\n`);
  // `--os`/`--cpu` pin the target platform's native addons, which are optional deps selected by
  // platform - without them, packing on a mac produces a tar missing linux's @pnpm/napi binary.
  // They are flags rather than a `pnpm.supportedArchitectures` field in the manifest above because
  // pnpm 12 no longer reads its settings from package.json's "pnpm" field: it warns
  // ("The following keys were ignored") and installs the *host* platform instead. Same reason
  // `install_bit_bundle` in .circleci/config.yml passes them on the command line. Verified on both
  // pnpm 10.17.1 and 12.0.0-rc.7, though `pnpm install --help` documents them on `add` only.
  const pnpmArgs = ['install', '--node-linker=hoisted', '--ignore-scripts', '--no-frozen-lockfile'];
  pnpmArgs.push(`--os=${PNPM_OS[targetOs]}`, `--cpu=${targetArch}`);
  if (registry) pnpmArgs.push(`--registry=${registry}`);
  run('pnpm', pnpmArgs, { cwd: innerDir });
  verifyNativeBinaries(innerDir, externals, PNPM_OS[targetOs], targetArch);

  // 2. pack the capsule exactly as it would be published, and unpack it next to the externals.
  const packDir = path.join(outDir, 'pack');
  fs.rmSync(packDir, { recursive: true, force: true });
  fs.mkdirSync(packDir, { recursive: true });
  run('npm', ['pack', '--ignore-scripts', `--pack-destination=${packDir}`], { cwd: capsuleDir });
  const [tarball] = fs.readdirSync(packDir).filter((entry) => entry.endsWith('.tgz'));
  if (!tarball) fail('npm pack produced no tarball');

  const bitPackageDir = path.join(innerDir, 'node_modules', '@teambit', 'bit');
  fs.mkdirSync(bitPackageDir, { recursive: true });
  // --strip-components drops npm's "package/" wrapper directory
  run('tar', ['-xzf', path.join(packDir, tarball), '-C', bitPackageDir, '--strip-components=1']);

  // 3. normalise the manifest to the one bvm reads. For a capsule this only pins the version; for
  //    `npm run bundle`'s out dir it also restores the identity fields that build does not emit
  //    (it generates a stand-in "@teambit/bit-bundle-externals" manifest - see create-package-json).
  const packedManifestPath = path.join(bitPackageDir, 'package.json');
  const packedManifest = JSON.parse(fs.readFileSync(packedManifestPath, 'utf8'));
  packedManifest.name = '@teambit/bit';
  packedManifest.version = version;
  packedManifest.bin = packedManifest.bin || { bit: './bin/bit' };
  packedManifest.bvm = { node: nodeVersion };
  delete packedManifest.private;
  fs.writeFileSync(packedManifestPath, `${JSON.stringify(packedManifest, null, 2)}\n`);

  //    the manifest above is NOT the one `bit --version` reports. `getBitVersion()` does
  //    `require.resolve('@teambit/bit')` from inside `bit.app.js`, which lives in
  //    dist/core-aspects/bundle - so node's upward walk finds the *shim* in the sibling
  //    dist/core-aspects/node_modules first and never reaches the manifest above. The shim carries
  //    whatever version the build machine had installed (`generate-shim-packages` preserves the
  //    original's), so without this the tar reports the base version and every -bundle.N build
  //    looks identical from the CLI. Only `version` is restamped: `componentId` stays at the real
  //    component version, which is what it identifies.
  const shimManifestPath = path.join(
    bitPackageDir,
    'dist/core-aspects/node_modules/@teambit/bit/package.json'
  );
  if (!fs.existsSync(shimManifestPath)) {
    fail(`the @teambit/bit bundle shim is missing at ${shimManifestPath} - "bit --version" would report the build machine's version`);
  }
  const shimManifest = JSON.parse(fs.readFileSync(shimManifestPath, 'utf8'));
  shimManifest.version = version;
  fs.writeFileSync(shimManifestPath, `${JSON.stringify(shimManifest, null, 2)}\n`);

  console.log(`[pack-for-bvm] @teambit/bit@${version}, node ${nodeVersion}`);

  // 4. everything the tar needs is now in place. verify before paying for the compression.
  const unresolved = Object.keys(externals).filter(
    (name) => !fs.existsSync(path.join(innerDir, 'node_modules', ...name.split('/')))
  );
  if (unresolved.length) fail(`externals not installed: ${unresolved.join(', ')}`);
  const packedMissing = REQUIRED_IN_CAPSULE.filter((entry) => !fs.existsSync(path.join(bitPackageDir, entry)));
  if (packedMissing.length) {
    fail(`npm pack dropped:\n  ${packedMissing.join('\n  ')}\ncheck "files"/.npmignore in the capsule`);
  }

  // 5. the staging manifest and lockfile stay out of the tar, so nothing can later run a package
  //    manager inside the installed version and prune it. same exclusions as CI's `compress_bit`.
  ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', 'node_modules/.modules.yaml'].forEach((entry) =>
    fs.rmSync(path.join(innerDir, entry), { force: true })
  );

  const tarName = `bit-${version}-${targetOs}-${targetArch}.tar.gz`;
  const tarPath = path.join(outDir, tarName);
  fs.rmSync(tarPath, { force: true });
  run('tar', ['-czf', tarPath, innerDirName], {
    cwd: stagingRoot,
    // macOS bsdtar otherwise writes an AppleDouble "._" file next to every entry
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  });

  if (!keepStaging) fs.rmSync(stagingRoot, { recursive: true, force: true });
  fs.rmSync(packDir, { recursive: true, force: true });

  const sizeMb = (fs.statSync(tarPath).size / 1024 / 1024).toFixed(1);
  console.log(`\n[pack-for-bvm] ${tarPath} (${sizeMb} MB)`);
  console.log(`\ntry it without uploading anything:\n  bvm install ${version} --file ${tarPath} --method tar\n`);
  console.log(`then upload it:
  gsutil cp ${tarPath} gs://bvm.bit.dev/bit/versions/${version}/${tarName}
  shasum -a 256 ${tarPath} > checksum.txt
  gsutil cp checksum.txt gs://bvm.bit.dev/bit/versions/${version}/bit-${version}-${targetOs}-${targetArch}.checksum.txt

and list it for the "dev" release type only:
  node scripts/add-bvm-index-entry.js --version ${version} --release-type dev
  gsutil cp index.json gs://bvm.bit.dev/bit/index.json
  gsutil setmeta -h "Cache-Control:no-cache" gs://bvm.bit.dev/bit/index.json
`);
}

main();
