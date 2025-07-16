#!/bin/bash

# CircleCI-specific CI Merge Wrapper Script
# This script handles environment variable VERSION_BUMP_TYPE for CircleCI
# and delegates to the enhanced 'bit ci merge' command which handles
# conventional commits and explicit keywords automatically

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to determine version bump flags from environment variable
get_version_bump_flags() {
    case "${VERSION_BUMP_TYPE:-}" in
        "major")
            echo "--major"
            ;;
        "minor")
            echo "--minor"
            ;;
        "patch")
            echo "--patch"
            ;;
        "")
            # No environment variable set, let bit ci merge handle auto-detection
            echo ""
            ;;
        *)
            log_warning "Invalid VERSION_BUMP_TYPE: ${VERSION_BUMP_TYPE}. Expected: major, minor, or patch"
            echo ""
            ;;
    esac
}

# Main execution
main() {
    log_info "🚀 CircleCI CI Merge Wrapper"
    
    # Check if VERSION_BUMP_TYPE is set and determine flags
    VERSION_BUMP_FLAGS=$(get_version_bump_flags)
    
    if [[ -n "$VERSION_BUMP_FLAGS" ]]; then
        log_info "Using version bump from environment variable: $VERSION_BUMP_FLAGS"
    else
        log_info "No VERSION_BUMP_TYPE environment variable set, using bit ci merge auto-detection"
    fi
    
    # Construct the command
    BASE_COMMAND="bit ci merge --build"
    FULL_COMMAND="$BASE_COMMAND $VERSION_BUMP_FLAGS"
    
    log_info "Executing: $FULL_COMMAND"
    
    # Execute the command
    if eval "$FULL_COMMAND"; then
        log_success "✅ CI merge completed successfully"
        exit 0
    else
        local exit_code=$?
        log_error "❌ CI merge failed with exit code: $exit_code"
        exit $exit_code
    fi
}

# Help function
show_help() {
    cat << EOF
CircleCI CI Merge Wrapper Script

This script provides environment variable support for CircleCI while delegating
to the enhanced 'bit ci merge' command which automatically handles:

- Conventional commits (if configured in workspace.jsonc)
- Explicit bump keywords (BIT-BUMP-MAJOR, BIT-BUMP-MINOR)
- Default patch versioning

Environment Variable (CircleCI-specific):
  VERSION_BUMP_TYPE: Set to major, minor, or patch to override auto-detection

Usage:
  $0 [--help]

Examples:
  # Use environment variable (takes precedence)
  VERSION_BUMP_TYPE=minor $0

  # Use auto-detection (conventional commits + explicit keywords)
  $0

Configuration in workspace.jsonc:
  "teambit.git/ci": {
    "useConventionalCommitsForVersionBump": true,  // Enable conventional commit parsing
    "useExplicitBumpKeywords": true,               // Enable BIT-BUMP-* keywords (default: true)
    "commitMessageScript": "..."                   // Custom commit message script
  }
EOF
}

# Check for help flag
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    show_help
    exit 0
fi

# Run main function
main "$@"