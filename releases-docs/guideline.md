# Bit Release Notes Writing Guidelines

This document provides guidelines for writing consistent and effective release notes for Bit releases.

## File Structure

Each release note file follows this structure:

```
title: v{VERSION}
tag: v{VERSION}
draft: false
prerelease: false
immutable: false
author: {AUTHOR_GITHUB_USERNAME}
created: {ISO_DATE}
published: {ISO_DATE}
url: https://github.com/teambit/bit/releases/tag/v{VERSION}
--

{RELEASE_CONTENT}
```

## Section Order

Release notes should include sections in the following order (include only sections that have content):

1. **New Features** - Major new functionality
2. **Improvements** (or **Changes**) - Enhancements to existing functionality
3. **Performance** - Performance-related improvements
4. **Bug Fixes** - Issues that have been resolved
5. **Internal** - Internal changes (dependencies, refactoring, CI, etc.)

### Section Headers

Use `###` (H3) for section headers in most releases:

```markdown
### New Features

### Improvements

### Performance

### Bug Fixes

### Internal
```

Note: Some older releases use `##` (H2) - either is acceptable, but `###` is preferred for consistency.

## Content Guidelines

### New Features Section

- Reserve for significant, user-facing new functionality
- Highlight major features with **bold text**
- Provide context and use cases when introducing complex features
- Include sub-bullets for detailed explanations of feature capabilities

**Example:**

```markdown
### New Features

- Introduce new **Lane History** to log changes of multiple components (#8381, #8370, #8383)
  - `bit lane history` command to inspect and control history of changes
  - `bit lane checkout` to "jump" back in time to a state of a lane
  - `bit lane revert` to revert implementation of all components in the last to a previous state (they will be `modified`)
- Introduce ability to mark dependencies as `optional` (#8169, #8290)
```

### Improvements/Changes Section

- Document enhancements to existing features
- Include command examples with backticks for CLI commands and flags
- Reference configuration file paths and property names in backticks
- Group related improvements together with sub-bullets

**Example:**

```markdown
### Improvements

- Allow setting up per-workspace with `--local` option `bit config set user.token xxx --local`, or `--local-track` to have config in `workspace.jsonc` (#9557, #9555)
- Enable auto-formatting components before snap/tag with `workspace.jsonc` config (#9497)
```

"teambit.defender/formatter": {
"formatOnPreSnap": true
}

```
- Improve various CLI/UI outputs and errors for better DX (#9507, #9502, #9506)
```

### Performance Section

- Be specific about what was optimized
- Mention the context/scenario where performance improved

**Example:**

```markdown
### Performance

- Reduce memory usage during peer dependencies resolution (#9156)
- Optimize build capsule creation for unmodified exported dependencies (#9820)
- Don't read and parse the lockfile multiple times for calculating deps graph (#10019)
```

### Bug Fixes Section

- Start each item with "Fix an issue where..." or "Fix a bug where..."
- Describe the problem that was fixed (the symptom users experienced)
- Be specific about the command or feature affected

**Example:**

```markdown
### Bug Fixes

- Fix an issue where `bit login` didn't validate the token when it announced user is "logged in" (#9562)
- Fix an issue where `bit install` crashed when it failed to delete unwanted items in `node_modules` (#9224)
- Fix an issue where components marked as `local-only` where still printed in the `snapped` or `pending` in `bit status` (#9266)
```

### Internal Section

This section covers changes that don't directly affect end users:

- Dependency updates (group multiple PRs together)
- Refactoring and code cleanup
- CI/CD improvements
- Preparation for upcoming features
- IDE plugin/extension support
- Removed deprecated code

**Example:**

```markdown
### Internal

- Update dependencies (#9299, #9227, #9310, #9298)
- Refactor old code and cleanups (#9324, #9326, #9325)
- Bit-Server improvements for IDE plugin (#9320, #9253, #9252)
- Move to node 22.14.0 (#9548)
```

## Formatting Rules

### PR References

- Always include PR numbers at the end of each item
- Format: `(#XXXX)` or `(#XXXX, #YYYY, #ZZZZ)` for multiple related PRs
- Group related PRs together on the same line item

### Code Formatting

- Use backticks for:
  - Command names: `bit install`, `bit start`
  - Flags: `--generate-types`, `--local`
  - File names: `workspace.jsonc`, `package.json`, `.bitmap`
  - Configuration properties: `componentRangePrefix`, `formatOnPreSnap`
  - Variable names and code references

### Bold Text

- Use `**bold**` for:
  - Major feature names: **Lane History**, **Local Only Component**
  - Product names: **Bit MCP Server**
  - Emphasis on important concepts

### Links

- Use markdown links for external references:
  - `[linkText](https://pnpm.io/settings#minimumreleaseage)`
- Link to documentation when referencing new configuration options

### Code Blocks

- Use fenced code blocks for configuration examples:
  ```json
  "teambit.defender/formatter": {
    "formatOnPreSnap": true
  }
  ```

## Release Size Guidelines

### Major Releases (many changes)

Include all sections with detailed explanations and sub-bullets for complex features.

### Minor Releases (few changes)

It's acceptable to have only 1-2 sections. A release with just bug fixes is valid:

```markdown
### Bug Fixes

- Fix issue where `bit start` failed to handle `null` for the new Developer Dropdown (#8499)
- Fix an issue where variables and class names weren't renamed correctly on `bit new` (#8501)
```

### WIP Releases

If a release is published but notes are not ready, use:

```markdown
WIP
```

## Categorization Decision Tree

When deciding where to place an item:

1. **Is it a completely new command or feature?** → New Features
2. **Does it enhance an existing feature?** → Improvements
3. **Does it make something faster or use less resources?** → Performance
4. **Does it fix something that was broken?** → Bug Fixes
5. **Is it a dependency update, refactor, or internal tooling?** → Internal

## Common Patterns

### Grouping Related Changes

When multiple PRs contribute to the same feature area, group them:

```markdown
- Bit MCP updates (#10004, #9967, #9965, #9963, #9953, #9951, #9952, #9980, #9979)
  - Improve `bit_component_details` tool for consumers, including batch support and improved data
  - `bit_remote_search` supports parallel query support
  - Update rules template
  - Added dedicated `bit_create` tool
```

### CLI Output Improvements

Generic UX improvements can be grouped together:

```markdown
- Improve various CLI/UI outputs and errors for better DX (#9507, #9502, #9506)
- UI, CLI, error messages, outputs and various Dev-Ex improvements (#9297, #9217, #9311, #9275)
```

### Dependency Updates

Group all dependency updates in Internal:

```markdown
- Update dependencies (#9299, #9227, #9310, #9298, #9222, #9315)
- Removed dependencies (#9342, #9369, #9210, #9456)
```

## Language Style

- Use present tense: "Fix an issue" not "Fixed an issue"
- Use active voice: "Support syntax highlighting" not "Syntax highlighting is supported"
- Be concise but descriptive
- Avoid jargon when possible, but technical terms are acceptable
- Use "an issue where" rather than "a bug where" for most cases

## Quality Checklist

Before publishing release notes, verify:

- [ ] All sections are in the correct order
- [ ] All PR numbers are included and correctly formatted
- [ ] Code elements use backticks
- [ ] Major features are properly highlighted in bold
- [ ] Bug fix descriptions explain the symptom (what was broken)
- [ ] Configuration examples are properly formatted
- [ ] No duplicate items across sections
- [ ] Language is consistent (present tense, active voice)
