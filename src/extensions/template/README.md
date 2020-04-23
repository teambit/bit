# Intro
This intro is about this template, and how to use it. it shouldn't be part of the extension readme itself.

This entire template should be created by the `bit create` command once it works.
It's here meantime for:
1. Review process
2. Workaround to quickly create new extensions until the `bit create` is ready

## File Structure
See examples in the files them self.

### index.ts
Main file of the extension component.
it should expose the following stuff:
1. the extension itself
2. public types to be used by other extensions
3. hooks to be used by other extensions

### template.cmd.tsx
Each command registered by the extension should be named [command-name].cmd.tsx.
An extension might expose many commands. each should be in its own file.

### template.extension.ts
The file that expose the extension itself.
This file should have the `@Extension` annotation.
Hooks should be exposed outside from this file via the `index.ts` file.

### types.ts
This file contains:
1. Type for the workspace config (workspace.json) it supports (maybe should be changed to json schema) (required)
2. Type for a variant config (component.json) it supports (maybe should be changed to json schema) (required)
3. Types that the extension wants to expose to other extension must be here (and exposed by the index.ts)
4. Types for internal use of the extension can be here or inline in the file that use them (for the extension developer to decide). If they are here but only for internal use, they shouldn't be exposed by the index.ts

## How to use
When creating new extension:
* copy this folder and rename all `template` occurrences (folder name, filenames, classes etc')
* fill the readme.md (delete this intro part)

---

# `extension node-module name`

2-3 sentences describing the extension (focus on defining the problem it solves and its responsibilities).

## Usage

Usage instructions, focused for the actual end user, not other maintainers that might use the extension programmatically.

- Stuff like configuration snippets for `workspace.json` and `component.json` (if available).
- How to use the commands/flags it exposes (if any).

> **Note** - for extensions that only provide APIs for other maintainers, use this section for API usage instructions.

## Rational

Extended description, preferably with a specific use case where this extension is required to solve a real-world problem.

## API Usage
Here we should explain (and demonstrate) how to use this extension progrematiccaly.
It mainly need to serve other people who want to build extension that consume this extension.

Sections to consider here:
1. Types - stuff that are not described by the type itself, like special fields, rational and meta-docs
2. Methods - mainly example of how to use the methods, or general info about them. the signature and stuff like this should be covered by the code itself. do not write it here again to prevent the need to maintain both places.
3. Hooks - same as methods, mainly about how to use them and examples, rather than stuff described by the code itself.

## Documentation
Here we should explain things in more details. Think about documentation for future maintainers of the extension.
Here should be stuff like:
1. Internal structure if it's complex
2. Special algorithms
3. General flow between the files / classes / functions
4. Open issues
