---
description: 'MDX aspect for component documantation and MDX components.'
labels: ['extension', 'aspect', 'mdx', 'bit']
---

The MDX aspect introduces `MDX components` and MDX component documentation to the Bit toolchain.

- **MDX components**. The react environments now supports MDX by default. This means, any component configured with the React Environment can now compile `.mdx` files to React components.
- **MDX docs** . Components can now be documented with MDX.
- Each component now accepts a `*.docs.mdx` file. So for example: `button.docs.mdx` will be rendered in the component Overview section.
- **Plain markdown support**. Regular markdown files are also supported and rendered through MDX. (e.g. `is-string.docs.md`).
- **MDX component compiler**. Compiler for MDX files. Can be configured in environments as any other compiler to support compilation of MDX files.

## Bit flavored MDX
The new Bit flavored MDX brings the Bit design system for component documantation teambit/documenter to MDX, provides a way to communicate documantation metadata to Bit and allows the creation of sharing of MDX components.

Example:

```md
---
displayName: Simple component
description: This is a very simple component description.
labels: ['first', 'component']
---

# A markdown title

Some markdown content.
```

In this example, metadata is communicated and parsed through [frontmatter](https://github.com/remarkjs/remark-frontmatter) and emitted from the markdown content but content is rendered in the Overview section.
MDX is compiled without the frontmatter which is emitted prior to compiling. 

This is built from three major components: 
- [MDX Layout](https://bit.dev/teambit/mdx/ui/mdx-layout) which is responsible for bringing Bit design system for component documantation [teambit/documenter](https://bit.dev/teambit/documenter) to MDX by default. Developers can replace MDX layout through the Docs aspect `registerMDXLayout()` API to include their own design systems and components to render markdown for component documantation.
- [Bit MDX compiler](https://bit.dev/teambit/mdx/modules/mdx-compiler). Independent module for compiling MDX flavoured Markdown.
- [Bit MDX loader](https://bit.dev/teambit/mdx/modules/mdx-loader). Webpack loader for Bit flavored MDX. Can be used from any Webpack configuration.
