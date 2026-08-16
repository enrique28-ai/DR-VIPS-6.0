---
name: git-commit-push
description: Safely stage the current local branch changes, create a commit, and push that same branch to origin. Use when the user asks to commit and push the current branch or upload the current branch changes to GitHub.
---

# Git Commit and Push Current Branch

Use this skill to safely commit the current working-tree changes on the branch that is already checked out, then push that same branch to `origin`.

## Core rules

- Operate only on the repository and branch that are already checked out.
- Do not switch branches.
- Do not merge, rebase, reset, revert, cherry-pick, tag, delete branches, or deploy.
- Never use `--force` or `--force-with-lease`.
- Never push directly from `main` or `master` unless the user explicitly says to do so in the current request.
- Never modify application files just to make the commit succeed.
- Never use `git add` before checking for likely secrets.
- If a command fails, stop and report the exact failure. Do not try destructive recovery automatically.

## Inputs

Optional:
- Commit message supplied by the user.

If the user does not provide a commit message:
- Inspect the staged diff.
- Generate a short, specific commit message that describes the actual change.
- Prefer a conventional prefix when obvious, such as `fix:`, `security:`, `test:`, `docs:`, `refactor:`, `chore:`, or `feat:`.
- Do not invent changes that are not present in the diff.

## Workflow

### 1. Confirm repository and current branch

Run:

```powershell
git rev-parse --is-inside-work-tree
git branch --show-current
git status -sb
```

Stop if:
- this is not a Git repository;
- the branch name is empty (detached HEAD);
- the current branch is `main` or `master` and the user did not explicitly authorize committing directly to it.

### 2. Inspect all pending changes before staging

Run:

```powershell
git status --short
```

If there are no changes, stop and tell the user there is nothing to commit.

Check the changed/untracked filenames for likely secrets or local-only credentials.

Treat these as sensitive by default:
- `.env`
- `.env.*` except `.env.example` or `.env.sample`
- `*.pem`
- `*.key`
- `id_rsa*`
- files with names containing `secret`, `secrets`, `credential`, `credentials`, or `token`
- `.npmrc` when it may contain an auth token
- cloud/service-account credential JSON files

If a likely sensitive file is present, do not stage or commit anything. Stop and ask the user to review it.

### 3. Stage the branch changes

After the safety check, stage all current intended working-tree changes:

```powershell
git add -A
```

Then verify exactly what is staged:

```powershell
git diff --cached --name-status
git diff --cached --stat
git diff --cached --check
```

If `git diff --cached --check` reports an error, stop before committing.

If nothing is staged, stop.

### 4. Review the staged diff

Inspect:

```powershell
git diff --cached
```

Use the diff to:
- confirm the commit only contains changes that were already present in the working tree;
- generate the commit message when the user did not supply one;
- detect obvious accidental files or secret material.

If the diff reveals likely credentials, secrets, generated junk, or unrelated changes that make the commit unsafe, stop and tell the user instead of committing.

### 5. Commit

If the user supplied a commit message, use it exactly unless it is empty.

Otherwise, generate a concise message from the staged diff.

Run:

```powershell
git commit -m "<commit message>"
```

If tests, hooks, linting, signing, or another commit hook fails, stop and report the failure. Do not bypass hooks with `--no-verify`.

### 6. Push the same current branch

Re-read the current branch:

```powershell
$branch = git branch --show-current
```

Determine whether it already has an upstream:

```powershell
git rev-parse --abbrev-ref --symbolic-full-name '@{u}'
```

If an upstream exists, run:

```powershell
git push
```

If no upstream exists, run:

```powershell
git push -u origin $branch
```

If the push is rejected, stop and report why. Do not automatically pull, rebase, merge, reset, or force-push.

### 7. Final verification

Run:

```powershell
git status -sb
git log -1 --oneline
```

If an upstream exists, also run:

```powershell
git rev-list --left-right --count HEAD...@{u}
```

Success means:
- the commit was created;
- the current branch was pushed to its upstream/origin;
- there are no unexpected uncommitted changes created by this workflow;
- local `HEAD` is not behind or ahead of its upstream after the push.

## Final response

Report only the useful result:

- branch name;
- short commit SHA and commit message;
- files/number of files committed;
- push result;
- final sync state.

Clearly mention any remaining uncommitted files.

Do not claim that code was deployed. A Git push is not a production deployment.
