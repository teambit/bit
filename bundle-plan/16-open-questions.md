# 12. Open questions for you

[← back to bundle-plan index](../bundle-plan.md)

- **OQ1 — who owns `typescript` / `@babel/core` / `webpack` / `@rspack/core`?** Should bit ship its
  own copies (today: ~96 MB of the 161 MB), or resolve them from the user's workspace with a lazy
  fallback? Biggest lever on install size, and a product decision rather than a technical one.
- **OQ2 — is `bit start` in scope for the bundle at all?** The instructions put `bit start --dev`
  out of scope; plain `bit start` is a different question, and answering it decides how much of the
  rspack/webpack surface has to survive.
- **OQ3 — should the repo's hand-written `esm.mjs` files be replaced by generated ones?** The bundle
  no longer needs them, but they remain a live source of "named export not found" bugs for ESM
  consumers of a normally-installed bit.
- **OQ4 — SEA: embed, stub, or drop?** The embedded binary is 2× slower on every command and still
  needs the 230 MB support dir; the stub form matches the script's speed but doesn't embed the JS.
  §9.3 recommends the script bundle; confirm before more work goes into the SEA path.
- **OQ5 — publish 109 packages (one bit + 108 thin shims) or one package with `bundleDependencies`?**
  §9b argues for 109 as the compatible answer, since those package names/versions already exist.
