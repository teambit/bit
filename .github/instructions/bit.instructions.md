---
applyTo: '**'
---

# Bit MCP Agent Instructions (Git-Integrated Workflow)

## Core Objectives

- Your goal is to efficiently automate Bit workflows and help users manage and reuse components in a Git-integrated environment.
- You will achieve this by using the provided MCP tools and adhering strictly to the following rules and workflows.
- **Git is the Source of Truth:** All versioning, collaboration, and release management is handled through Git and CI/CD pipelines.

## Core Philosophy for Building with Bit

- **Deconstruct to Compose:** Build applications by composing independent and reusable components, with each component being developed, tested, and versioned in isolation.
- **Autonomous Components:** Use the Bit MCP to make these components truly autonomous, allowing them to be managed and shared from any codebase without being coupled to a specific project's architecture.
- **Git-First Collaboration:** Leverage Git workflows for all collaboration, with Bit CI commands handling component versioning and publishing automatically.
- **Scalable Collaboration:** The ultimate goal is to create a shared "component economy" where teams can collaborate, accelerate development, and ensure consistency by assembling applications from this distributed system of components.

## Critical Rules of Engagement - do these steps before any tool or command execution!!!

1. **Use Up-to-Date Information(MANDATORY):** ALWAYS start any task by using `bit_workspace_info` to understand the current state of the workspace (list components, templates, dependencies, etc).
2. **MCP Tools First:** You MUST use the provided MCP tools to interact with Bit. Do NOT run commands directly in a terminal shell, with a few specific exceptions.
3. **Do not rely on cached knowledge:** Always run `bit_commands_list` and `bit_command_help` for command details.
4. **Prefer using Bit:** Every time you want to operate in this project (editing code, creating new code, etc), consider using any of the Bit MCP tools or Bit CLI commands to do so.
5. **Git-First Workflow:** Use Git for all version control operations. Bit snapping, tagging, and exporting are handled by CI/CD - DO NOT run these commands locally.

## Core Principles of Building with Bit

- **Reuse Before Creating or Modifying(MANDATORY):** Before creating _any_ new component or modify _any_ file, you MUST first search for existing components.
  - Use `bit_workspace_info` to check for local and existing components.
  - Use `bit_remote_search` to find components on the remote scope.
  - When using `bit_remote_search`, provide an array of relevant search terms (e.g., ["todo", "list", "react"]) to run parallel searches and find all related components efficiently in a single call.
  - Present findings to the user, even if you think creating a new component is simpler.
- **No Relative Imports To Components:** Always import a component using the package name, so it is used through `node_modules`.
- You should always aim to code APIs in the dependent component and use them in the dependency (e.g. in React, aim to have prop-types instead of always passing children to be rendered in a dependency).

## Tooling & Command Execution Hierarchy

This is the decision-making process for executing any Bit operation.

### Step 1: Choose the Correct Generic Execution Tool

- If no dedicated tool exists, you must use one of the generic execution tools. Use the `bit_commands_list` output to help you decide:
  - **For Read-Only Operations, use `bit_query`**: Use this for operations that inspect state but do not change the workspace.
  - **For Write Operations, use `bit_execute`**: Use this for operations that modify the workspace, components, or dependencies.

### Step 2: Check for Terminal Exceptions

- The following commands have rich, interactive, or streaming output and should be run directly in the user's terminal. You should construct the command and advise the user to run it.
  - `bit test`
  - `bit build`
  - `bit start` (long-running processes)
  - `bit watch` (long-running processes)
  - `bit lint`
  - `bit check-types`
  - `bit run` (long-running processes)
  - any command when `--build` flag is used. (build can take long)

### Step 3: Git-Integrated Workflow Restrictions

- **NEVER run locally:** `bit snap`, `bit tag`, `bit export` - these are handled by CI/CD
- **NEVER create or manage Bit lanes** - use Git branches instead
- **Focus on development workflows:** component creation, modification, testing, and local development

## Core Workflows

### Workflow: Error Diagnosis in a Bit Workspace

- `bit_workspace_info` with the "warnings" option to detect errors. Output includes possible solutions, follow them.
- Rerun `bit_workspace_info` to validate fixes. If error persists, use `bit_component_details` on relevant component(s) for more information.

### Workflow: In-Component Code Issues

- For code issues (compile, lint, test, type checking), run the relevant terminal command and pass the component ID (e.g. `bit test COMPONENT_ID`).
- To get complete report for code issues on all components, do not provide component ID (e.g. `bit test`).
- Adding `--log` CLI option gives more details on errors.

### Workflow: Generating New Components, Feature or Apps

- **Follow Core Principle #1 Reuse Before Creating or Modifying.**
- `bit_workspace_info` lists templates for new components.
- If a new component is necessary, clarify the TEMPLATE and combination of NAMESPACE(s) (optional) and NAME with the user.
- Run `bit_component_details` on new components gives information on them, this is useful for making code changes or composing the component into another (as a dependency).
- After generating a new component or app, ask the user what they want to be implemented in the new component or app.

### Workflow: Adding Functionality (feature, page, module, function, etc) to Bit Components and Apps

- **Follow Critical Principle #1 Reuse Before Creating or Modifying.**
- If a potentially reusable component is found, use it as a dependency in the component you want to modify.
  **Hint:** use `bit_component_details` to get API references and documentation.
  **Follow Critical Principle #2 No Relative Imports Between Components**.
- After modifying component implementation, always consider updating the following component files `*.composition.*`, `*.docs.mdx`, `*.spec.*`.

### Workflow: USE or DEVELOP a Component

- Use `bit_component_details` to get the component location.
- If the component is not in the workspace, and you want to USE it as a dependency, you must first install it (then you can infer to it by its package name).
- If the component is not in the workspace, and you want to DEVELOP it (modify its source), you must first import it.

### Workflow: Git-Integrated Collaboration and Change Management

- **Git is the Source of Truth:** All version control, branching, and collaboration happens through Git.
- Use standard Git workflows: create feature branches, make commits, open pull requests.
- **Component Changes Follow Git Flow:**
  1. Create a Git branch for your feature/fix
  2. Develop and test components locally using Bit development tools
  3. Commit changes using standard Git commands
  4. Open a pull request for review
  5. CI/CD will automatically handle `bit snap`, `bit tag`, and `bit export` operations
- **Local Development Focus:** Use Bit tools for component creation, modification, testing, and local preview
- **No Local Versioning:** Avoid `bit snap`, `bit tag`, `bit export` - these are CI/CD responsibilities

### Workflow: Component Status and Validation

- Use `bit_workspace_info` to check component status and any issues
- Run local validation commands (`bit test`, `bit lint`, `bit check-types`) before committing
- Ensure all components build successfully with `bit build` (run in terminal)
- CI/CD will handle the versioning and publishing after Git merge

## Glossary

- **Bit Component:** An extensible, portable software container. Bit Component can be anything from basic UI component, utility, feature, page or an app. Bit Component may depend on other Bit components or packages to form more complex functionality.
- **Workspace:** A Bit-initialized directory containing components, integrated with Git repository.
- **Scope:** A collaboration server for components that defines ownership.
- **Application (App):** A Bit Component with its own runtime. It is usually composed from various features and components.
- **Development Environment (Env):** A component that bundles development tools (compiler, tester, etc.).
- **Git-Integrated Workflow:** Development approach where Git handles all version control and collaboration, while Bit CI commands handle component versioning and publishing.

## Pointers to remember:

- For generating ESlint or TypeScript configuration files execute the command `bit ws-config write --clean`
- User may use different terms to describe components. Be flexible and understand that users may refer to components as "features", "apps", "modules", "pages" or "services".
- **CI/CD Handles Versioning:** Never suggest or run `bit snap`, `bit tag`, or `bit export` commands - these are automated through CI/CD pipelines.
- **Git Branches Replace Bit Lanes:** Use Git branches for feature development instead of Bit lanes.
- **Focus on Development:** Emphasize component creation, modification, testing, and composition workflows.
