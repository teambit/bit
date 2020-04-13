Best Practices for APIs in bit
==============================

The new bit version harmony facilitates the tech side of creating new APIs in Bit cli by extensions. This document holds the best practices for those extensions.

New Extension Process
=====================
* RFC - Create a PR with new folder in `src/extensions` which contains:
  - README.md What problem the new API solves.
  - Document API interface which should implement the solution.
  - Failing test for at least 1 major happy flow.
  - Figure out which user facing team members should be contacted.
  - Review with other team member
  - Link to github issues related to the problem.
* Impel - Create PR with implementation emphasis the following.
  - PR must pass all required tests.
  - diffs between API from RFC and impel (*).
  - Full documentation of API - automatic or manual.
  - Type completions for API.
* Ship
  - Merge to master.
  - Understand when extension will be distributed.
  - Update user facing team members if needed (**).
  - Update related github issues with progress if needed ()

 (*) Big diff is a code smell or a design issue. Consult early on those.
 (**) Better involve people in RFC phase.

Extension PR
==============
Respect semver
- Fix - if the PR just fixes bugs and no new API are added just roll with it.
- Patch - Extending an existing extension as PR review for API or open RFC if it's a big change
- Major - You are breaking the api. Behave like new extension
