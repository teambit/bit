---
name: generate-release-notes
description: Generate comprehensive release notes for Bit from git commits and pull requests. Use when creating release notes, building changelogs, documenting version releases, or preparing a new Bit release.
---

# Generate Release Notes for Bit

This skill helps generate release notes for Bit following the established patterns and guidelines.

## Important: Intermediate Files

All intermediate steps must be saved to `releases-docs/temp-files/` for review. This folder is gitignored.

**Required intermediate files:**

1. `raw-commits.md` - Raw commit data from GitHub API
2. `filtered-commits.md` - Two sections: filtered out commits and kept commits

## Workflow

Follow these steps to generate release notes:

### Step 1: Setup Temp Directory

First, ensure the temp directory exists:

```bash
mkdir -p releases-docs/temp-files
```

### Step 2: Determine the Commit Range

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

### Step 3: Fetch Commits and Save to raw-commits.md

Use the GitHub API to get commits between the release and the starting point:

```bash
# Compare commits between release and HEAD (or specific commit)
gh api "repos/teambit/bit/compare/${RELEASE_COMMIT}...${FROM_COMMIT}" \
    --jq '.commits[] | "\(.sha[0:7]) | \(.commit.message | split("\n")[0]) | \(.commit.author.name)"'
```

**Save the output to `releases-docs/temp-files/raw-commits.md`** with the following format:

```markdown
# Raw Commits

Generated: {DATE}
From: {FROM_COMMIT or HEAD}
To: {RELEASE_TAG} ({RELEASE_COMMIT})
Total commits: {COUNT}

## Commits

| Hash    | Message                      | Author      |
| ------- | ---------------------------- | ----------- |
| abc1234 | feat: add new feature (#123) | Author Name |
| def5678 | fix: resolve bug (#456)      | Author Name |

...
```

### Step 4: Filter Commits and Save to filtered-commits.md

Analyze each commit and categorize into two groups:

**FILTER OUT (do not include in release notes):**

- Version bump commits: `bump teambit version to X.X.X [skip ci]`
- CI-only changes: commits that only modify CircleCI config
- Skip CI markers: commits with `[skip ci]` in the message
- Auto-merge commits: `Merge branch 'X' into master`

**KEEP (include in release notes):**

- All feature commits (`feat:`)
- All fix commits (`fix:`)
- All performance commits (`perf:`)
- Dependency updates (go in Internal section)
- Refactoring commits (go in Internal section)

**Save to `releases-docs/temp-files/filtered-commits.md`** with the following format:

```markdown
# Filtered Commits

Generated: {DATE}

## Filtered Out ({COUNT} commits)

These commits are excluded from the release notes:

| Hash    | Message                                   | Reason       |
| ------- | ----------------------------------------- | ------------ |
| abc1234 | bump teambit version to 1.13.5 [skip ci]  | Version bump |
| def5678 | ci, temporarily set tag to increment by 2 | CI change    |

...

## Kept for Release Notes ({COUNT} commits)

These commits will be included in the release notes:

| Hash    | Message                         | Category     |
| ------- | ------------------------------- | ------------ |
| ghi9012 | feat: add new command (#123)    | New Features |
| jkl3456 | fix: resolve issue (#456)       | Bug Fixes    |
| mno7890 | chore(deps): bump lodash (#789) | Internal     |

...
```

### Step 5: Enrich Commit Information

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

### Step 6: Categorize Changes

Group the KEPT commits into these categories based on content:

| Category         | Indicators                                                                        |
| ---------------- | --------------------------------------------------------------------------------- |
| **New Features** | New commands, new major functionality, "Introduce", "feat:" prefix                |
| **Improvements** | Enhancements, "Support", "Allow", "Add option", improvements to existing features |
| **Performance**  | "Optimize", "perf:", "Reduce memory", "Speed up", "Improve performance"           |
| **Bug Fixes**    | "Fix", "fix:", bug corrections, issue resolutions                                 |
| **Internal**     | Dependency updates, refactoring, CI changes, code cleanup, test improvements      |

### Step 7: Write Release Notes

Follow the guidelines in `releases-docs/guideline.md`:

1. **Section Order:** New Features → Improvements → Performance → Bug Fixes → Internal
2. **Only include sections that have content**
3. **Format each item:**
   - Start with a verb (Fix, Add, Support, Improve, Introduce)
   - Include PR numbers at the end: `(#1234)` or `(#1234, #1235)`
   - Use backticks for: commands, flags, file names, config properties
   - Use **bold** for major feature names

### Step 8: Save the Release Notes

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

## Output Files Summary

| File                                | Location                    | Purpose                          |
| ----------------------------------- | --------------------------- | -------------------------------- |
| `raw-commits.md`                    | `releases-docs/temp-files/` | Raw commit data for review       |
| `filtered-commits.md`               | `releases-docs/temp-files/` | Filtered/kept commits for review |
| `v{VERSION}.md` or `new-release.md` | `releases-docs/releases/`   | Final release notes              |

## Reference Files

- **Guidelines:** `releases-docs/guideline.md` - Detailed formatting and style guidelines
- **Examples:** `releases-docs/releases/` - Previous release notes for reference patterns

## Helper Scripts (Optional)

The `releases-docs/scripts/` directory contains shell scripts for manual use:

- `get-release-commits.sh [FROM_COMMIT] [TO_TAG]` - Fetches commits between releases
- `filter-commits.sh` - Filters out uninteresting commits (pipe input to it)

These scripts are provided for manual/CLI use. When using this skill, Claude uses the `gh` API commands directly as they work from any directory without needing the local git repository.

## Tips

1. **Group related PRs** - Multiple PRs for the same feature should be one line item
2. **Be concise** - Users scan release notes; keep items short and clear
3. **Focus on user impact** - Describe what changed for the user, not implementation details
4. **Check for typos** - Common in commit messages; fix them in release notes
5. **Verify PR numbers** - Ensure all referenced PRs exist and are correct
