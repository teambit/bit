# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**IMPORTANT**: This repository practices "dogfooding" - Bit is built using Bit itself. Always use `bit` commands rather than direct npm/pnpm commands where possible.

### Setup and Installation

- `npm run full-setup` - Complete setup for the repository (installs dependencies, sets up husky, compiles)
- `npm run setup` - Basic setup (bit install and compile)
- `bit install` - Install dependencies (uses PNPM under the hood, never run `pnpm install` directly)
- `npm run dev-link [alias]` - Creates a global symlink for the bit binary (default: bit-dev)

### Build and Compilation

- `bit compile` - Compile all components
- `bit watch` - Watch for changes and compile automatically
- `npm run check-types` - Run TypeScript type checking without emitting files

### Testing

- `bit test` - Run unit tests for components/aspects
- `bit test --debug` - Run unit tests in debug mode (prints workspace location, keeps workspaces)
- `npm run e2e-test` - Run end-to-end tests (can take hours, usually run on CI)
- `npm run e2e-test:debug` - Run e2e tests in debug mode (keeps workspaces, prints output)
- `npm run mocha-circleci` - Run mocha tests with CircleCI configuration

### Linting and Formatting

- `npm run lint` - Run ESLint and TypeScript type checking
- `npm run lint:fix` - Run ESLint with auto-fix
- `npm run oxlint` - Run oxlint (faster linter)
- `npm run format` - Format code with Prettier
- `npm run prettier:check` - Check if code is formatted correctly

### Bit-specific Commands

- `bit start` - Start the Bit UI for component development
- `bit status` - Show workspace status
- `bit compile` - Compile components
- `bit test` - Run tests
- `bit tag` - Tag components for release
- `bit export` - Export components to remote scopes

## Architecture Overview

### Component System

Bit is built using a component-based architecture where the entire codebase is composed of reusable components. The system follows a modular approach with:

- **Aspects**: Core building blocks that provide functionality across the system
- **Scopes**: Organizational units that group related components
- **Environments**: Define how components are built, tested, and bundled
- **Capsules**: Isolated environments for component operations

### Key Directories

**Core Architecture:**

- `scopes/` - Contains all aspects organized by domain (harmony, component, dependencies, etc.)
- `components/` - Standalone components and utilities
- `e2e/` - End-to-end tests organized by functionality

**Important Scopes:**

- `scopes/harmony/` - Core runtime and infrastructure aspects
- `scopes/component/` - Component-related functionality
- `scopes/compilation/` - Build and compilation aspects
- `scopes/dependencies/` - Dependency management
- `scopes/workspace/` - Workspace management
- `scopes/scope/` - Remote scope operations

**Legacy Code:**

- `components/legacy/` - Legacy Bit implementation for backward compatibility

### Aspect System

Each aspect follows a standard structure:

- `.aspect.ts` - Aspect definition and metadata
- `.main.runtime.ts` - Main runtime implementation
- `.ui.runtime.ts` - UI runtime implementation (if applicable)
- `.docs.mdx` - Documentation
- `.composition.tsx` - Component compositions for testing

### Configuration

- `workspace.jsonc` - Main workspace configuration
- `package.json` - Node.js dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `.bitmap` - Component tracking (auto-generated)

### Development Patterns

**Dependency Management:**

- Uses `bit install` which runs PNPM programmatically under the hood
- Never run `pnpm install` directly - always use `bit install`
- `bit install` performs multiple operations beyond just package installation
- Strict peer dependency rules configured
- Component dependencies managed through Bit's dependency resolver

**Testing Strategy:**

- Unit tests: `.spec.ts` files alongside source
- E2E tests: Comprehensive scenarios in `e2e/` directory
- Component compositions: Interactive examples in `.composition.tsx`

**Build Process:**

- TypeScript compilation with strict mode
- Babel for transpilation
- Webpack for bundling
- ESLint for linting with custom rules

### Key Concepts

**Bootstrap Flow:**

1. User runs a Bit command
2. Bit builds a graph of core aspects + workspace aspects
3. All aspects are loaded and instantiated
4. Aspects register CLI commands
5. Command is parsed and executed

**Component Lifecycle:**

- Add/Create: Components added to workspace (.bitmap updated)
- Tag/Snap: Components versioned and stored in scope
- Export: Components published to remote scopes
- Import: Components brought into workspace from remote scopes

**Workspace vs Scope:**

- Workspace: Development environment with source code
- Scope: Storage for versioned components (local: `.bit/`, remote: Bit Cloud)

## Development Notes

### Dogfooding Philosophy

This repository is built using Bit itself, demonstrating the "dogfooding" approach. Key principles:

- **Reuse Before Creating**: Always search for existing components before creating new ones
- **No Relative Imports Between Components**: Import components using package names via `node_modules`
- **Component Autonomy**: Each component should be independently developed, tested, and versioned
- **Use Bit Commands**: Prefer `bit` commands over direct npm/pnpm/shell commands when possible

### Working with Components

- Components are tracked in `.bitmap` file
- Use `bit add` to track new components
- Use `bit create` to scaffold new components from templates
- Component IDs follow the pattern: `namespace/component-name`
- Always run `bit status` to understand workspace state
- Use `bit import` to bring components into workspace for development
- Use `bit install` to install components as dependencies

### Environments

- Components use environments for build, test, and bundle operations
- Default environments: Node.js, React, Angular, Vue
- Custom environments can be created by extending base environments

### Debugging

- Debug logs: `~/Library/Caches/Bit/logs/debug.log` (macOS)
- Verbose logging: `BIT_LOG=*` prefix
- Stack traces written to debug.log
- Use `bit globals` to locate debug.log

### Performance

- Use `bit watch` for faster development cycles
- E2E tests run in parallel on CI
- Component compilation can be parallelized
