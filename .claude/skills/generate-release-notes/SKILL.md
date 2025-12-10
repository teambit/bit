---
name: generate-release-notes
description: Generate comprehensive release notes for Bit from git commits and pull requests. Use when creating release notes, building changelogs, documenting version releases, or preparing a new Bit release.
---

# Generate Release Notes for Bit

This skill helps generate release notes for Bit following the established patterns and guidelines.

## Workflow

Follow these steps to generate release notes:

### Step 1: Determine the Commit Range

1. **Get the latest release tag and commit:**

   ```bash
   # Get latest release tag
   gh release view --repo teambit/bit --json tagName -q '.tagName'

   # Get the commit SHA for the tag (handles annotated tags)
   TAG="v1.12.158"  # Replace with actual tag
   TAG_REF=$(gh api "repos/teambit/bit/git/refs/tags/$TAG" -q '.object.sha')
   TAG_TYPE=$(gh api "repos/teambit/bit/git/refs/tags/$TAG" -q '.object.type')

   if [ "$TAG_TYPE" = "tag" ]; then
       # Annotated tag - get the commit it points to
       RELEASE_COMMIT=$(gh api "repos/teambit/bit/git/tags/$TAG_REF" -q '.object.sha')
   else
       # Lightweight tag - already have the commit
       RELEASE_COMMIT=$TAG_REF
   fi
   ```

2. **Determine the starting point:**
   - If user provides a specific commit hash, use that as `FROM_COMMIT`
   - If not provided, use `HEAD` (latest commit on master)

### Step 2: Fetch Commits Between Releases

Use the GitHub API to get commits between the release and the starting point:

```bash
# Compare commits between release and HEAD (or specific commit)
gh api "repos/teambit/bit/compare/${RELEASE_COMMIT}...${FROM_COMMIT}" \
    --jq '.commits[] | "\(.sha[0:7]) | \(.commit.message | split("\n")[0]) | \(.commit.author.name)"'
```

### Step 3: Filter Out Uninteresting Commits

Remove commits that should NOT appear in release notes:

- Version bump commits: `bump teambit version to X.X.X [skip ci]`
- CI-only changes: commits that only modify CircleCI config
- Skip CI markers: commits with `[skip ci]` in the message
- Auto-merge commits: `Merge branch 'X' into master`

**Keep these commits** (they go in Internal section):

- Dependency updates (e.g., "chore(deps): bump X from Y to Z")
- Refactoring commits

### Step 4: Enrich Commit Information

For commits that are merge commits or have unclear messages, fetch PR details:

```bash
# Get PR details by number
gh pr view 12345 --repo teambit/bit --json title,body,labels

# Search for PR by commit
gh pr list --repo teambit/bit --search "SHA_HERE" --state merged --json number,title,body
```

Look for:

- PR title and description
- Labels (feat, fix, perf, etc.)
- Related issues

### Step 5: Categorize Changes

Group commits into these categories based on content:

| Category         | Indicators                                                                        |
| ---------------- | --------------------------------------------------------------------------------- |
| **New Features** | New commands, new major functionality, "Introduce", "feat:" prefix                |
| **Improvements** | Enhancements, "Support", "Allow", "Add option", improvements to existing features |
| **Performance**  | "Optimize", "perf:", "Reduce memory", "Speed up", "Improve performance"           |
| **Bug Fixes**    | "Fix", "fix:", bug corrections, issue resolutions                                 |
| **Internal**     | Dependency updates, refactoring, CI changes, code cleanup, test improvements      |

### Step 6: Write Release Notes

Follow the guidelines in `releases-docs/guideline.md`:

1. **Section Order:** New Features → Improvements → Performance → Bug Fixes → Internal
2. **Only include sections that have content**
3. **Format each item:**
   - Start with a verb (Fix, Add, Support, Improve, Introduce)
   - Include PR numbers at the end: `(#1234)` or `(#1234, #1235)`
   - Use backticks for: commands, flags, file names, config properties
   - Use **bold** for major feature names

### Step 7: Save the Release Notes

Save to `releases-docs/releases/` folder:

- If version provided: `releases-docs/releases/v{VERSION}.md`
- If no version: `releases-docs/releases/new-release.md`

**Important:** Do NOT include the header metadata (title, tag, draft, etc.) - only the release content starting from the sections.

## Example Output Format

```markdown
### New Features

- New `bit validate` command to run a complete `test`, `lint`, `compile` and `typecheck` for a project (#10022)
- **Bit Scripts** for simple shell commands or function execution for components (#10028)

### Improvements

- `bit recover` command now supports component and glob patterns (#10033)
- Improve error messages in CLI (#10027, #9983)

### Performance

- Don't read and parse the lockfile multiple times for calculating deps graph (#10019)

### Bug Fixes

- Fix an issue where test duration had incorrect format (#9940)
- Fix an issue where `bit new` wasn't resolving a remote env (#9981)

### Internal

- Update dependencies (#10018, #10015, #10006)
- Modernize some legacy code (#10024, #10014)
```

## Reference Files

- **Guidelines:** `releases-docs/guideline.md` - Detailed formatting and style guidelines
- **Examples:** `releases-docs/releases/` - Previous release notes for reference patterns
- **Scripts:** `releases-docs/scripts/` - Helper scripts for fetching commits

## Tips

1. **Group related PRs** - Multiple PRs for the same feature should be one line item
2. **Be concise** - Users scan release notes; keep items short and clear
3. **Focus on user impact** - Describe what changed for the user, not implementation details
4. **Check for typos** - Common in commit messages; fix them in release notes
5. **Verify PR numbers** - Ensure all referenced PRs exist and are correct
