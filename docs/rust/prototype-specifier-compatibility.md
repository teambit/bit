# Object prototype dependency keys

The legacy JS/TS detectives accumulate dependency metadata in ordinary JavaScript objects. Specifiers matching inherited `Object.prototype` properties can disappear or cause a metadata extraction error. A native `IndexMap` would retain those imports, changing observable behavior.

The scanner explicitly returns `unsupported` when an extracted dependency key is one of the twelve own property names of `Object.prototype`. TypeScript comment suppression still runs first. Relative names such as `./toString`, and binding names imported from an ordinary package, remain supported. The existing adapter then executes the original detective, preserving its omissions or parsing issue instead of silently fixing an unrelated legacy defect.

Two scanner tests exercise JS/TS fallback, relative keys, and ignored TypeScript imports. The broader differential corpus covers each key and multiple import/call/re-export forms, plus ordinary dependency keys with prototype-named bindings. This is a compatibility fallback, not a source parse error.

The small CLI bootstrap is moved into the transport module to keep the scanner implementation below pnpm's unchanged 400-line file limit. Validation uses the pinned pnpm formatter, Clippy, perfectionist, and all scanner tests.
