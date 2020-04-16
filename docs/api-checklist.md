API checklist
==============

The new bit version harmony facilitates the tech side of creating new APIs in Bit cli by extensions.
This document holds checklists for creating and changing APIs by extensions.

Creating an Extension
===================
* RFC - Create a PR with new folder in `src/extensions` which contains:
  - README.md What problem the new API solves.
  - Document API interface which should implement the solution.
  - Commands decide on command product if needed.s
  - Failing test for at least 1 major happy flow.
  - Find users for your extension.
  - Review with another team member
  - Link to github issues related to the problem.
* Impel - Create PR with implementation emphasis the following.
  - PR must pass all required tests.
  - diffs between API from RFC and impel (*).
  - Full documentation of API - automatic or manual.
  - Type completions for API.
* Ship
  - Merge to master.
  - Understand when extension will be distributed (NPM, bit.dev etc).
  - Update users of extension (**).
  - Update related github issues with progress if needed ()

 (*) Big diff is a code smell or a design issue.
 (**) Better involve people in RFC phase. Early is better.

Changing an Extension
======================
Respect semver
- Fix: if the PR just fixes bugs and no new API are added just roll with it.
- Patch:  All patches must be reviewed at least (decide if RFC is needed)
- Major:  You are breaking the api. Perform new extension checklist.


