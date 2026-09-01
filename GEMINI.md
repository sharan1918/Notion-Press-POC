# Project Guidelines & Rules

## Git Commit Conventions
All Git commits must strictly follow the **Conventional Commits** standard. Avoid generic commit messages. Use professional, descriptive messages formatted as:

`<type>(<scope>): <short summary>`

### Allowed Types:
- `feat:` — New features or functional capabilities
- `fix:` — Bug fixes and error trace corrections
- `refactor:` — Code restructuring without changing external behavior
- `docs:` — Documentation updates (README, design notes, inline docs)
- `style:` — Formatting, styling, CSS adjustments
- `test:` — Adding or updating test cases
- `chore:` — Dependencies, build scripts, configuration changes

### Examples:
- `feat(policy): add urgency threshold to guardrail evaluation`
- `fix(backend): update sqlite checkpointer lifespan context manager`
- `docs(readme): add uv setup and execution guide`
- `chore(deps): pin requirements with uv pip compile`

## Git Workflow & Permissions
- **NEVER execute `git commit` or `git push` without explicit user permission.**
- Always present the proposed code changes and suggested Conventional Commit message, and wait for explicit user approval before staging, committing, or pushing to remote repositories.
- **NEVER auto-merge feature branches into `develop` or `main`.** Always push feature branches independently and allow the user to review and merge via GitHub Pull Requests.
