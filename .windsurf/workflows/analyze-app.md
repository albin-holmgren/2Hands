---
description: Analyze the entire application structure and provide a comprehensive overview
tags: [workflow, analysis, app-structure]
---

# Analyze Entire App Workflow

This workflow helps you analyze the entire application structure and provide a comprehensive overview.

## Steps

1. **Explore Root Directory Structure**
   - List the root directory to understand the monorepo layout
   - Identify key configuration files (package.json, pnpm-workspace.yaml, turbo.json)

2. **Analyze Apps Directory**
   - Explore `apps/` directory to find all applications
   - For each app, read its package.json to understand:
     - App name and purpose
     - Framework and tech stack
     - Key dependencies
     - Scripts and commands

3. **Analyze Packages Directory**
   - Explore `packages/` directory for shared packages
   - Read package.json files to understand shared utilities

4. **Check Environment Configuration**
   - Read env.example to understand required environment variables
   - Note any critical configuration files

5. **Document Key Source Files**
   - Identify and read key source files in each app:
     - Main entry points
     - Layout files
     - Configuration files (next.config, etc.)

6. **Provide Comprehensive Summary**
   - Tech stack overview
   - App structure diagram
   - Key dependencies
   - Important directories and their purposes
   - Any notable architectural patterns

## Output Format

After running this workflow, you should provide:

1. **Monorepo Structure** - Overview of the workspace layout
2. **Tech Stack** - Frameworks, libraries, and tools used
3. **App Breakdown** - Each app's purpose and key features
4. **Shared Packages** - What utilities are shared across apps
5. **Key Configuration** - Important config files and environment variables
6. **Architecture Notes** - Any notable patterns or conventions

## Example Commands

```bash
# Explore structure
ls -la /
pnpm list --depth=0

# Read key files
cat package.json
cat pnpm-workspace.yaml
cat turbo.json
```
