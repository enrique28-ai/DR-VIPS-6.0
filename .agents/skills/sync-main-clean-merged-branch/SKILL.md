---
name: sync-main-clean-merged-branch
description: Safely verify that the current pushed feature branch has been merged into origin/main, switch to main, fast-forward pull the latest main from GitHub, delete the merged feature branch locally and from origin, and verify that main is synchronized and the branch is gone in both places.
---

# Sync Main and Clean Merged Branch

Use this skill after a feature/security/fix branch has been pushed to GitHub and its pull request has already been merged into `main`.

The workflow must verify the merge before deleting anything.

## Core behavior

1. Capture the current local feature branch.
2. Fetch the latest state from `origin`.
3. Verify that the branch commit is already contained in `origin/main`.
4. Switch to local `main`.
5. Fast-forward local `main` from `origin/main`.
6. Verify local `main` exactly matches `origin/main`.
7. Delete the merged feature branch locally.
8. Delete the same branch from `origin`.
9. Prune remote-tracking refs.
10. Verify that the branch no longer exists locally or on GitHub/origin.
11. Verify again that `main` is synchronized.

## Safety rules

- Never deploy.
- Never merge a feature branch into `main` locally.
- Never use `git merge`.
- Never use `git rebase`.
- Never use `git reset`.
- Never use `git push --force` or `--force-with-lease`.
- Never delete `main`, `master`, or the repository default branch.
- Never delete a branch unless its tip is confirmed to be an ancestor of the latest `origin/main`.
- Never use `git branch -D`; use only safe deletion with `git branch -d`.
- Never continue with uncommitted working-tree changes unless the user explicitly asks to preserve/manage them separately.
- If any verification fails, stop before deletion and report the exact failure.
- A successful Git synchronization is not a production deployment.

## Assumption

By default, the branch to clean is the branch currently checked out when this skill starts.

This is intentionally safer than guessing which GitHub branch was "the latest merged branch."

If the skill starts while already on `main` or `master`, stop and ask the user which merged branch should be cleaned. Do not guess.

## Workflow

### 1. Verify repository and capture the branch to clean

Run:

```powershell
git rev-parse --is-inside-work-tree
$branch = git branch --show-current
git status -sb
```

Stop if:
- this is not a Git repository;
- `$branch` is empty (detached HEAD);
- `$branch` is `main` or `master`;
- the working tree is not clean.

For a strict clean-tree check, run:

```powershell
if (git status --porcelain) {
  Write-Error "Working tree is not clean. Stop before switching branches or deleting anything."
  exit 1
}
```

Capture the branch tip before switching:

```powershell
$branchSha = git rev-parse HEAD
```

### 2. Fetch the latest GitHub/origin state

Run:

```powershell
git fetch origin --prune
```

Verify that `origin/main` exists:

```powershell
git show-ref --verify --quiet refs/remotes/origin/main
if ($LASTEXITCODE -ne 0) {
  Write-Error "origin/main does not exist. Stop."
  exit 1
}
```

Capture the latest remote main SHA:

```powershell
$originMainSha = git rev-parse origin/main
```

### 3. Verify the feature branch is already merged into latest origin/main

This is the critical deletion gate.

Run:

```powershell
git merge-base --is-ancestor $branchSha origin/main
```

If the exit code is not `0`, stop immediately:

```powershell
if ($LASTEXITCODE -ne 0) {
  Write-Error "Branch '$branch' is not fully merged into origin/main. Nothing will be deleted."
  exit 1
}
```

Optionally show the evidence:

```powershell
git log -1 --oneline $branchSha
git log -1 --oneline origin/main
```

Do not rely only on branch names or PR status. The ancestor check is the deletion authority.

### 4. Switch to main and pull the latest merged state

Run:

```powershell
git switch main
git pull --ff-only origin main
```

If `git switch main` or the fast-forward pull fails, stop. Do not recover with merge/rebase/reset automatically.

### 5. Verify local main is exactly synchronized with GitHub

Run:

```powershell
$localMainSha = git rev-parse HEAD
$remoteMainSha = git rev-parse origin/main
git status -sb
git rev-list --left-right --count HEAD...origin/main
```

Require:

```text
0    0
```

Also require exact SHA equality:

```powershell
if ($localMainSha -ne $remoteMainSha) {
  Write-Error "Local main does not exactly match origin/main. Stop before deleting the branch."
  exit 1
}
```

### 6. Delete the merged branch locally

Run safe deletion only:

```powershell
git branch -d $branch
```

If Git refuses deletion, stop. Do not replace `-d` with `-D`.

### 7. Delete the same branch from GitHub/origin

First check whether the remote branch still exists:

```powershell
$remoteBranch = git ls-remote --heads origin "refs/heads/$branch"
```

If it exists, delete it:

```powershell
if ($remoteBranch) {
  git push origin --delete $branch
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Remote branch deletion failed."
    exit 1
  }
}
```

If it is already absent, do not treat that as failure; continue to verification.

### 8. Prune and verify branch deletion in both places

Run:

```powershell
git fetch origin --prune
```

Verify the local branch is gone:

```powershell
git show-ref --verify --quiet "refs/heads/$branch"
if ($LASTEXITCODE -eq 0) {
  Write-Error "Local branch '$branch' still exists."
  exit 1
}
```

Verify the remote GitHub branch is gone:

```powershell
$remoteStillExists = git ls-remote --heads origin "refs/heads/$branch"
if ($remoteStillExists) {
  Write-Error "Remote branch '$branch' still exists on origin."
  exit 1
}
```

Verify the remote-tracking ref is also gone:

```powershell
git show-ref --verify --quiet "refs/remotes/origin/$branch"
if ($LASTEXITCODE -eq 0) {
  Write-Error "Remote-tracking branch 'origin/$branch' still exists locally."
  exit 1
}
```

### 9. Final main synchronization verification

Run:

```powershell
git switch main
git fetch origin --prune
git status -sb
git rev-parse HEAD
git rev-parse origin/main
git rev-list --left-right --count HEAD...origin/main
git branch -a
```

Success requires:

- current branch is `main`;
- working tree is clean;
- local `HEAD` equals `origin/main`;
- ahead/behind count is `0 0`;
- `$branch` does not appear as a local branch;
- `origin/$branch` does not appear as a remote-tracking branch;
- `git ls-remote --heads origin "refs/heads/$branch"` returns nothing.

## Optional GitHub-level verification

If a GitHub connector/tool is available, perform a read-only branch lookup after the Git commands and verify that the deleted branch no longer exists in the repository.

Do not use a GitHub write operation from this verification step; the branch deletion should already have been performed by the local Git push.

## Final response

Report:

- cleaned branch name;
- captured feature branch SHA;
- current `main` SHA;
- whether `main == origin/main`;
- ahead/behind count;
- local branch deletion result;
- remote branch deletion result;
- final branch list summary.

Use wording like:

```text
Branch cleaned: feature/example
Local deletion: confirmed
GitHub/origin deletion: confirmed
main synchronized with origin/main: confirmed
Ahead/behind: 0/0
Current branch: main
```

Do not claim deployment occurred.
