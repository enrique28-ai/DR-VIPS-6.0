---
name: sync-main-clean-merged-branch
description: Safely synchronize main and clean an explicitly named merged branch or the current feature branch, verifying local and actual origin tips independently before deletion and confirming all refs are absent.
---

# Sync Main and Clean Merged Branch

Read root `AGENTS.md` first. Use this skill only for authorized synchronization/cleanup after integration, not while reviewing or editing the skill. Never guess the latest merged branch. Ancestry, not a PR label alone, establishes deletion authority.

## Safety rules

- Never delete main, master or the repository default branch.
- Require a clean working tree. Preserve user work; do not automatically discard, stash, restore, overwrite or unstage it.
- Never automatically merge, rebase, reset, revert, cherry-pick, force push, use force-with-lease, bypass hooks with `--no-verify`, or deploy.
- Use only safe local deletion (`git branch -d`); never `git branch -D`. Refusal stops the workflow.
- No destructive recovery. Stop on failed safety gates and report partial completion accurately.
- Validate each existing local/remote tip independently against freshly fetched origin/main.
- Git synchronization and branch deletion are not deployment. `docs/DEPLOYMENT.md` owns release behavior.

## PowerShell conventions

Execute the following blocks in order in one session. Replace only the explicit input with the exact user-supplied name; otherwise leave it null. Native-command output is not proof of success: check `$LASTEXITCODE` immediately. Unexpected output also stops the workflow.

### 1. Verify repository, clean state and protected default branch

```powershell
git rev-parse --is-inside-work-tree
if ($LASTEXITCODE -ne 0) { throw "Not a Git repository." }
$currentBranch = git branch --show-current
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($currentBranch)) { throw "Branch lookup failed or detached HEAD." }
$dirty = git status --porcelain
if ($LASTEXITCODE -ne 0) { throw "Status lookup failed." }
if ($dirty) { throw "Working tree is not clean; preserve user work." }
$originUrl = git remote get-url origin
if ($LASTEXITCODE -ne 0) { throw "origin lookup failed." }
$pushUrls = @(git remote get-url --push --all origin)
if ($LASTEXITCODE -ne 0) { throw "Push URL lookup failed." }
if ($pushUrls.Count -ne 1) { throw "Expected one origin push URL." }
```

Inspect both origin destinations and verify the intended repository. If fetch and push URLs differ, stop until their equivalence/intent is established. Do not delete from a separate push repository merely because its remote is named origin.

```powershell
git fetch origin --prune
if ($LASTEXITCODE -ne 0) { throw "Fetch failed." }
git rev-parse --verify "refs/remotes/origin/main^{commit}"
if ($LASTEXITCODE -ne 0) { throw "origin/main is unavailable." }
$remoteHead = @(git ls-remote --symref origin HEAD)
if ($LASTEXITCODE -ne 0) { throw "Remote default-branch lookup failed." }
$headRefLines = @($remoteHead | Where-Object { $_ -cmatch '^ref: refs/heads/(.+)\s+HEAD$' })
if ($headRefLines.Count -ne 1) { throw "Remote default branch is unknown." }
if ($headRefLines[0] -cnotmatch '^ref: refs/heads/(.+)\s+HEAD$') { throw "Malformed remote HEAD." }
$defaultBranch = $Matches[1]
```

### 2. Resolve the target, never from main HEAD

```powershell
$requestedBranch = $null # Set to the exact explicitly requested target, if supplied.
$protectedBranches = @('main', 'master', $defaultBranch)
if ($null -ne $requestedBranch) {
    if ([string]::IsNullOrWhiteSpace($requestedBranch)) { throw "Explicit target is empty." }
    $branch = $requestedBranch
    if ($currentBranch -cnotin $protectedBranches -and $currentBranch -cne $branch) {
        throw "Explicit target differs from checked-out feature branch; ask for clear intent."
    }
} else {
    if ($currentBranch -cin $protectedBranches) { throw "Ask which merged branch to clean." }
    $branch = $currentBranch
}
git check-ref-format --branch "$branch"
if ($LASTEXITCODE -ne 0) { throw "Invalid target branch." }
if ($branch -cin $protectedBranches) { throw "Protected target; do not delete." }
```

An explicit target works when already on main/master. Do not ask again when it is unambiguous. If another feature branch is checked out, stop on mismatch rather than choosing silently.

### 3. Resolve each copy and prove independent containment

These two small lookup helpers are scoped to this workflow. They return null ONLY for successful absence. They never mutate refs.

```powershell
function Get-LocalTargetSha {
    $localRefs = @(git for-each-ref --format='%(refname)' "refs/heads/$branch")
    if ($LASTEXITCODE -ne 0) { throw "Local target lookup failed." }
    if ("refs/heads/$branch" -cnotin $localRefs) { return $null }
    $sha = git rev-parse --verify "refs/heads/$branch^{commit}"
    if ($LASTEXITCODE -ne 0) { throw "Local target SHA lookup failed." }
    return $sha
}
function Get-RemoteTargetSha {
    $lines = @(git ls-remote --heads origin "refs/heads/$branch")
    if ($LASTEXITCODE -ne 0) { throw "Remote target lookup failed; absence is not established." }
    if ($lines.Count -eq 0) { return $null }
    $pattern = '^([0-9a-f]{40,64})\s+' + [regex]::Escape("refs/heads/$branch") + '$'
    if ($lines.Count -ne 1 -or $lines[0] -cnotmatch $pattern) { throw "Malformed remote target output." }
    return $Matches[1]
}
$localBranchSha = Get-LocalTargetSha
$remoteBranchSha = Get-RemoteTargetSha
if ($null -ne $localBranchSha) {
    git merge-base --is-ancestor $localBranchSha origin/main
    if ($LASTEXITCODE -ne 0) { throw "Local target is not proven merged." }
}
if ($null -ne $remoteBranchSha) {
    git cat-file -e "$remoteBranchSha^{commit}"
    if ($LASTEXITCODE -ne 0) { throw "Remote commit unavailable locally; stop, do not assume containment." }
    git merge-base --is-ancestor $remoteBranchSha origin/main
    if ($LASTEXITCODE -ne 0) { throw "Actual remote target is not proven merged." }
}
```

Record both SHAs separately; they may differ. The remote SHA comes from the successful live lookup, not HEAD or a possibly stale tracking ref. If an object is unavailable, stop and report inability to prove containment; a later safe fetch and full revalidation may establish it. Missing one copy does not authorize deletion of the other.

### 4. Synchronize main before any deletion

```powershell
git switch main
if ($LASTEXITCODE -ne 0) { throw "Switch to main failed." }
git pull --ff-only origin main
if ($LASTEXITCODE -ne 0) { throw "Fast-forward pull failed; no automatic recovery." }
$currentBranch = git branch --show-current
if ($LASTEXITCODE -ne 0 -or $currentBranch -cne 'main') { throw "Not on main." }
$dirty = git status --porcelain
if ($LASTEXITCODE -ne 0 -or $dirty) { throw "Cannot establish a clean tree." }
$mainSha = git rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw "HEAD lookup failed." }
$originMainSha = git rev-parse --verify refs/remotes/origin/main
if ($LASTEXITCODE -ne 0) { throw "origin/main lookup failed." }
if ($mainSha -cne $originMainSha) { throw "main differs from origin/main." }
$counts = git rev-list --left-right --count "HEAD...origin/main"
if ($LASTEXITCODE -ne 0 -or $counts -notmatch '^0\s+0$') { throw "main is not synchronized." }
# Pull may have refreshed origin/main: re-prove both recorded tips against it.
foreach ($tip in @($localBranchSha, $remoteBranchSha)) {
    if ($null -ne $tip) {
        git merge-base --is-ancestor $tip origin/main
        if ($LASTEXITCODE -ne 0) { throw "Recorded tip is no longer proven merged." }
    }
}
```

If already on main, the same checks apply. Do not use merge/rebase/reset to resolve divergence. If both copies were absent, synchronize main and perform final verification without deletion, reporting cleanup was already complete.

### 5. Safely delete the local copy, if present

```powershell
$localNow = Get-LocalTargetSha
if ($localNow -cne $localBranchSha) { throw "Local target changed after verification; stop." }
if ($null -ne $localNow) {
    git branch -d -- "$branch"
    if ($LASTEXITCODE -ne 0) { throw "Safe local deletion refused; do not force." }
}
```

Do not delete a newly created or moved local ref. If the recorded local copy was absent, skip its deletion. An unexpected disappearance during this run stops for revalidation, rather than silently changing the recorded state.

### 6. Recheck actual remote tip immediately before deleting

Before this block, reconfirm origin's fetch/push URLs are unchanged from step 1 and the intended default branch has not changed. Stop on any failed check or changed destination/protected branch. No unrelated operations belong between the target lookup and delete.

```powershell
$remoteNow = Get-RemoteTargetSha
if ($null -eq $remoteNow) {
    # Successful absence: already removed; no push needed.
} else {
    if ($null -eq $remoteBranchSha -or $remoteNow -cne $remoteBranchSha) {
        throw "Remote target appeared or moved after verification; do not delete."
    }
    git -c push.followTags=false push origin --delete "$branch"
    if ($LASTEXITCODE -ne 0) { throw "Remote deletion failed; report local/remote results separately." }
}
```

No output after a failed lookup never reaches the absence branch: the helper throws. A changed SHA stops even if the new commit might also be merged; do not silently substitute new deletion authority.

This recheck reduces, but does not eliminate, the race between lookup and ordinary remote deletion. It is NOT atomic compare-and-delete. If concurrent writers cannot be ruled out and that residual risk is unacceptable, stop for coordination. Do not introduce prohibited force-with-lease as a workaround.

### 7. Fetch/prune and verify every final invariant

```powershell
git fetch origin --prune
if ($LASTEXITCODE -ne 0) { throw "Final fetch/prune failed." }
$finalLocal = Get-LocalTargetSha
if ($null -ne $finalLocal) { throw "Local target still exists." }
$trackingRefs = @(git for-each-ref --format='%(refname)' "refs/remotes/origin/$branch")
if ($LASTEXITCODE -ne 0) { throw "Tracking-ref lookup failed." }
if ("refs/remotes/origin/$branch" -cin $trackingRefs) { throw "Target tracking ref still exists." }
$finalRemote = Get-RemoteTargetSha
if ($null -ne $finalRemote) { throw "Actual remote target still exists." }
$currentBranch = git branch --show-current
if ($LASTEXITCODE -ne 0 -or $currentBranch -cne 'main') { throw "Final branch is not main." }
$dirty = git status --porcelain
if ($LASTEXITCODE -ne 0 -or $dirty) { throw "Final working tree is not proven clean." }
$mainSha = git rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw "Final HEAD lookup failed." }
$originMainSha = git rev-parse --verify refs/remotes/origin/main
if ($LASTEXITCODE -ne 0 -or $mainSha -cne $originMainSha) { throw "Final main SHA mismatch." }
$counts = git rev-list --left-right --count "HEAD...origin/main"
if ($LASTEXITCODE -ne 0 -or $counts -notmatch '^0\s+0$') { throw "Final ahead/behind is not 0 0." }
git status -sb
if ($LASTEXITCODE -ne 0) { throw "Final status failed." }
git branch -a
if ($LASTEXITCODE -ne 0) { throw "Final branch listing failed." }
```

| Initial copies | Required proof and action |
| --- | --- |
| Local + remote | Prove each tip; safe local deletion and unchanged-remote-tip deletion |
| Local only | Prove local tip; delete locally; successful remote absence requires no push |
| Remote only | Prove actual remote tip; skip local deletion |
| Neither | Successful absence checks; no deletion; report already complete |

## Final response

Report the target, independently captured local/remote SHAs (or already absent), final main SHA, exact main/origin equality, ahead/behind, clean state and local/remote/tracking deletion results separately. Include successful live lookup evidence and remaining uncertainty. On failure report partial completion; do not claim everything was cleaned. No deployment occurred.
