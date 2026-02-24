# AI Agent Guidelines

## Permissions

Agents operating in this repository have full access to:

- Read any file in the repository.
- Create, modify, and delete files as needed.
- Run shell commands: linting (`npm run lint`), typechecking (`npm run typecheck`), tests (`npm run test`), dev servers (`npm run dev:mobile`, `npm run dev:admin`), Supabase CLI commands, and any other repo scripts.
- Install dependencies via `npm install`.
- Deploy Supabase edge functions via `supabase functions deploy`.
- Update these root documentation files as the project evolves.

## Safety Boundaries

- **No secrets in the repo.** Never commit API keys, tokens, passwords, or service-role keys. Use placeholders and reference `docs/secrets.md` for the secrets inventory.
- **No force-push.** Do not run `git push --force` or `git reset --hard` on shared branches.
- **No credential commits.** Do not commit `.env`, `.env.local`, or any file containing real credentials. The `.gitignore` already excludes these.
- **Follow existing patterns.** Match the code style, file naming, and architecture conventions already present in the codebase before introducing new ones.
- **Branch naming.** Use `codex/<feature-name>` for new branches.
- **Scoped commits.** Keep each commit to a single deliverable increment.

## Workflow

Every task must follow this sequence:

1. **Analyze** -- Read relevant files, understand the current state, identify what needs to change.
2. **Plan** -- Break the work into micro-steps. Write out what will change and why before making edits.
3. **Implement** -- Execute each micro-step. Make the smallest viable change per step.
4. **Verify** -- After each micro-step, run verification commands (`npm run lint`, `npm run typecheck`, `npm run test`). Fix any issues before proceeding to the next step.
5. **Update docs** -- After all steps pass, update the relevant root documentation files (see Doc Update Policy below).

## Doc Update Policy

After completing work, update these root docs when applicable:

| Trigger | Files to update |
|---|---|
| New feature or screen added | `PRD.md`, `ARCHITECTURE.md` |
| Architectural change (new service, integration, data store) | `ARCHITECTURE.md`, `DECISIONS.md` |
| Schema or migration change | `ARCHITECTURE.md` |
| Significant technical decision made | `DECISIONS.md` |
| Milestone completed or work queue changes | `PLANS.md` |
| New workflow or process established | `CHECKLISTS.md`, `AGENTS.md` |
| Bug fix with root-cause insight | `DECISIONS.md` (if pattern worth recording) |

## VERIFY Checklist Template

Agents must append this checklist (filled in) to their output after completing a task:

```
### VERIFY
- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes
- [ ] Changes tested manually (describe what was tested)
- [ ] No secrets or credentials committed
- [ ] Root docs updated (list which ones, or "N/A")
- [ ] Edge functions deployed if backend changed (Y/N/N/A)
- [ ] Commit message is scoped and descriptive
```
