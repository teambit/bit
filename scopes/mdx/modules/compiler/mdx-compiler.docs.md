---
title: MDX Compiler
labels: ["compiler", "mdx", "node"]
description: Bit MDX format compiler.
---

The MDX compiler enables the compilation of Bit-flavoured MDX files. That includes parsing-out and removing Bit's frontmatter properties (which are part of the Bit flavored MDX) from the output code.

This is an example Bit flavoured MDX:

```md
---
displayName: Simple component
description: This is a very simple component description.
labels: ["first", "component"]
---

# A markdown title

This is a Bit flavoured MDX file.
```
