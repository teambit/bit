#!/bin/bash

# Script to fetch commits between releases for Bit repository
# Usage: ./get-release-commits.sh [FROM_COMMIT] [TO_TAG]
# - FROM_COMMIT: Starting point (HEAD if not provided)
# - TO_TAG: Previous release tag (fetches latest if not provided)

set -e

REPO="teambit/bit"

# Get the previous release tag (latest release)
get_latest_release_tag() {
    gh release view --repo "$REPO" --json tagName -q '.tagName'
}

# Get the commit SHA for a given tag
get_tag_commit() {
    local tag=$1
    # First get the tag reference
    local tag_ref=$(gh api "repos/$REPO/git/refs/tags/$tag" -q '.object.sha' 2>/dev/null)

    if [ -z "$tag_ref" ]; then
        echo "Error: Could not find tag $tag" >&2
        exit 1
    fi

    # Check if it's an annotated tag (points to tag object) or lightweight tag (points directly to commit)
    local tag_type=$(gh api "repos/$REPO/git/refs/tags/$tag" -q '.object.type' 2>/dev/null)

    if [ "$tag_type" = "tag" ]; then
        # Annotated tag - need to get the commit it points to
        gh api "repos/$REPO/git/tags/$tag_ref" -q '.object.sha' 2>/dev/null
    else
        # Lightweight tag - already have the commit
        echo "$tag_ref"
    fi
}

# Parse arguments
FROM_COMMIT="${1:-HEAD}"
TO_TAG="${2:-$(get_latest_release_tag)}"

if [ -z "$TO_TAG" ]; then
    echo "Error: Could not determine the latest release tag" >&2
    exit 1
fi

echo "Fetching commits from $FROM_COMMIT to release $TO_TAG" >&2

# Get the commit SHA for the release tag
RELEASE_COMMIT=$(get_tag_commit "$TO_TAG")

if [ -z "$RELEASE_COMMIT" ]; then
    echo "Error: Could not get commit for tag $TO_TAG" >&2
    exit 1
fi

echo "Release $TO_TAG commit: $RELEASE_COMMIT" >&2
echo "---" >&2

# Fetch commits between the two points
# Format: SHORT_HASH | SUBJECT | AUTHOR | DATE
gh api "repos/$REPO/compare/${RELEASE_COMMIT}...${FROM_COMMIT}" \
    --jq '.commits[] | "\(.sha[0:7]) | \(.commit.message | split("\n")[0]) | \(.commit.author.name) | \(.commit.author.date)"' \
    2>/dev/null

