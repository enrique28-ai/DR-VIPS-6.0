---
name: git-commit-push
description: Commit only approved changes on the current local branch and push HEAD explicitly to the same-named branch on origin, with staged-scope and remote-SHA verification. Use when the user asks to commit and push current branch changes.
---

# Git Commit and Push Current Branch

Read root `AGENTS.md` first. Use this workflow only when committing and pushing are authorized, not when merely reviewing or editing the skill. It operates on the current repository and branch.

## Core rules

- Do not switch branches or modify application files to make a commit succeed.
- Never automatically merge, rebase, reset, revert, cherry-pick, tag, delete branches or deploy.
- Never use force push, force-with-lease or hook bypass (`--no-verify`).
- Do not discard, stash, restore, overwrite or unstage user work as recovery.
- Stop on failed commands/safety gates; report the exact failure and any operation already completed. Do not retry a rejected push through automatic pull or history rewriting.
- Never commit/push from main, master or the repository default branch without explicit authorization for that branch.
- Preserve unrelated changes. Authorization to commit some work is not permission to stage everything.
- Git publication is not deployment; `docs/DEPLOYMENT.md` owns release behavior.

## Inputs and command conventions

Use the user's commit message exactly when nonempty; otherwise derive a concise message from the reviewed staged diff. Prefer a conventional prefix where appropriate, without inventing changes.

Derive approved paths from the explicit request and established task scope. Ask if ambiguous. Examples use PowerShell; replace placeholders with reviewed values. Run blocks in order in one session, stopping on errors. Check `$LASTEXITCODE` immediately after each native Git command, including inspection commands. No workflow step authorizes bypassing host permission prompts.

### 1. Capture branch and verify destination

```powershell
git rev-parse --is-inside-work-tree
if ($LASTEXITCODE -ne 0) { throw "Not a Git repository." }
$branch = git branch --show-current
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($branch)) { throw "Branch lookup failed or detached HEAD." }
$startBranch = $branch
git check-ref-format --branch "$branch"
if ($LASTEXITCODE -ne 0) { throw "Invalid branch." }
$originUrl = git remote get-url origin
if ($LASTEXITCODE -ne 0) { throw "origin lookup failed." }
$pushUrls = @(git remote get-url --push --all origin)
if ($LASTEXITCODE -ne 0) { throw "Push URL lookup failed." }
if ($pushUrls.Count -ne 1) { throw "Expected one origin push URL." }
$upstream = git for-each-ref --format='%(upstream)' "refs/heads/$branch"
if ($LASTEXITCODE -ne 0) { throw "Upstream lookup failed." }
if ($upstream -and $upstream -cne "refs/remotes/origin/$branch") {
    throw "Unexpected upstream '$upstream'; report mismatch and obtain direction before pushing."
}
$remoteHead = @(git ls-remote --symref origin HEAD)
if ($LASTEXITCODE -ne 0) { throw "Default-branch lookup failed." }
$headRefLines = @($remoteHead | Where-Object { $_ -cmatch '^ref: refs/heads/(.+)\s+HEAD$' })
if ($headRefLines.Count -ne 1) { throw "Repository default branch is unknown." }
if ($headRefLines[0] -cnotmatch '^ref: refs/heads/(.+)\s+HEAD$') { throw "Malformed remote HEAD." }
$defaultBranch = $Matches[1]
$allowProtectedBranch = $false # True only for explicit authorization in the current request.
if ($branch -cin @('main', 'master', $defaultBranch) -and -not $allowProtectedBranch) { throw "Protected branch not authorized." }
```

Inspect origin's fetch and push destinations and confirm they identify the intended repository. If they differ, stop until their equivalence/intent is established; do not silently push to a separate repository. Unknown default branch means stop and ask. An absent upstream is allowed, but a failed lookup is not an absent upstream. Do not change upstream configuration to hide a mismatch.

### 2. Inspect pending changes and approve the staging set

```powershell
git status --short
if ($LASTEXITCODE -ne 0) { throw "Status failed." }
git diff --cached --name-status
if ($LASTEXITCODE -ne 0) { throw "Staged path inspection failed." }
git diff --name-status
if ($LASTEXITCODE -ne 0) { throw "Unstaged path inspection failed." }
```

If there is nothing to commit, stop. Untracked files are not included in `git diff`; mere presence is never approval. Check filenames for sensitive material before displaying content.

- If staged changes match approved scope, preserve them; do not add unrelated unstaged changes.
- If staged paths or content are outside scope, stop. Do not automatically unstage them.
- If the same file has staged and unstaged hunks, do not replace the staged selection with the whole file unless that exact adjustment is approved.
- If unrelated modifications make the intended file/hunk set uncertain, ask which changes belong in the commit.
- Review rename source/destination paths and deletions as part of the scope.

Before adding any paths, check pending filenames and proposed content for likely secrets/local-only data. Treat these as sensitive by default:

- `.env` / `.env.*` except example/sample templates (which still need content review).
- `*.pem`, `*.key`, `id_rsa*`.
- Names containing secret(s), credential(s) or token.
- Potentially auth-bearing `.npmrc` and cloud/service-account credential JSON.

If likely credentials, private keys, secrets, generated junk or clearly unrelated staged/proposed content is found, stop for user review. Do not expose credential values in the report, delete files or silently repair the index.

After the filename gate, inspect staged and intended unstaged content (and intentionally selected untracked files separately). Stop on sensitive material before reproducing it in a report. For mixed work, restrict the unstaged diff to the explicit candidate paths:

```powershell
git diff --cached
if ($LASTEXITCODE -ne 0) { throw "Staged diff inspection failed." }
git diff -- ':(literal)path/to/approved-file'
if ($LASTEXITCODE -ne 0) { throw "Unstaged diff inspection failed." }
```

### 3. Stage only selected approved paths

Skip this step when the approved staged set is already complete. Never stage the repository root, whole directories or automatically collected changed/untracked paths.

For each reviewed file, use an explicit literal pathspec with pathspec termination. Replace the example; do not execute its placeholder:

```powershell
$approvedPaths = @(':(literal)path/to/approved-file')
git add -- $approvedPaths
if ($LASTEXITCODE -ne 0) { throw "Selective staging failed." }
```

Do not use whole-repository staging options. Literal pathspecs prevent wildcard characters in filenames from broadening scope.

### 4. Require the final staged set to match scope

```powershell
git diff --cached --name-status
if ($LASTEXITCODE -ne 0) { throw "Staged paths failed." }
git diff --cached --stat
if ($LASTEXITCODE -ne 0) { throw "Staged stat failed." }
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw "Staged whitespace check failed." }
git diff --cached
if ($LASTEXITCODE -ne 0) { throw "Staged review failed." }
```

Require a nonempty staged set with exactly the approved paths AND changes. Recheck sensitive filenames/content and unexpected generated files. If mismatched, stop without altering the index. Follow applicable validation in `docs/TESTING.md` and report missing checks. If staging/content changes during review, repeat these gates.

### 5. Commit, then revalidate before pushing

Immediately before commit, confirm branch still equals `$startBranch` and the final staged scope remains approved:

```powershell
$branch = git branch --show-current
if ($LASTEXITCODE -ne 0 -or $branch -cne $startBranch) { throw "Branch changed." }
git commit -m "<approved commit message>"
if ($LASTEXITCODE -ne 0) { throw "Commit failed; do not bypass hooks/signing/tests." }
$committedSha = git rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw "Commit SHA lookup failed." }
```

Recheck against the captured values without overwriting them. Do not follow an arbitrary upstream:

```powershell
$branchNow = git branch --show-current
if ($LASTEXITCODE -ne 0 -or $branchNow -cne $startBranch) { throw "Branch changed before push." }
$originNow = git remote get-url origin
if ($LASTEXITCODE -ne 0 -or $originNow -cne $originUrl) { throw "origin changed before push." }
$pushUrlsNow = @(git remote get-url --push --all origin)
if ($LASTEXITCODE -ne 0) { throw "Push URL recheck failed." }
if ($pushUrlsNow.Count -ne 1 -or $pushUrlsNow[0] -cne $pushUrls[0]) { throw "Push destination changed." }
$upstreamNow = git for-each-ref --format='%(upstream)' "refs/heads/$startBranch"
if ($LASTEXITCODE -ne 0) { throw "Upstream recheck failed." }
if ($upstreamNow -and $upstreamNow -cne "refs/remotes/origin/$startBranch") { throw "Unexpected upstream; stop and report mismatch." }
$headNow = git rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $headNow -cne $committedSha) { throw "HEAD changed before push." }
```

If any revision expression uses `@{u}`, quote it, for example `git rev-parse --abbrev-ref --symbolic-full-name '@{u}'`; prefer the explicit origin branch below.

Only after those gates, push current HEAD to the same-named origin branch. Disable implicit tag following for this command only:

```powershell
git -c push.followTags=false push --set-upstream origin "HEAD:refs/heads/$branch"
if ($LASTEXITCODE -ne 0) { throw "Push failed; stop without automatic recovery." }
```

### 6. Verify actual remote SHA and synchronization

```powershell
git fetch origin
if ($LASTEXITCODE -ne 0) { throw "Post-push fetch failed." }
$remoteBranch = @(git ls-remote --heads origin "refs/heads/$branch")
if ($LASTEXITCODE -ne 0) { throw "Remote lookup failed; absence is not established." }
if ($remoteBranch.Count -eq 0) { throw "Lookup succeeded but pushed branch is absent." }
$remotePattern = '^([0-9a-f]{40,64})\s+' + [regex]::Escape("refs/heads/$branch") + '$'
if ($remoteBranch.Count -ne 1 -or $remoteBranch[0] -cnotmatch $remotePattern) { throw "Unexpected remote output." }
$remoteSha = $Matches[1]
$headSha = git rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw "HEAD lookup failed." }
$branchNow = git branch --show-current
if ($LASTEXITCODE -ne 0 -or $branchNow -cne $startBranch) { throw "Branch changed after push." }
if ($headSha -cne $committedSha -or $remoteSha -cne $headSha) { throw "Local/remote SHA mismatch." }
$trackingSha = git rev-parse --verify "refs/remotes/origin/$branch"
if ($LASTEXITCODE -ne 0 -or $trackingSha -cne $remoteSha) { throw "Tracking ref unavailable or stale." }
$counts = git rev-list --left-right --count "HEAD...origin/$branch"
if ($LASTEXITCODE -ne 0 -or $counts -notmatch '^0\s+0$') { throw "Same-name origin branch is not synchronized." }
git status --short
if ($LASTEXITCODE -ne 0) { throw "Final status failed." }
git log -1 --oneline
if ($LASTEXITCODE -ne 0) { throw "Final log failed." }
```

Successful empty remote output means absence ONLY when the lookup succeeded; after a push that is a verification failure, not success. Missing/stale tracking refs are not grounds for assuming synchronization.

## Final response

Report branch, commit SHA/message, committed paths/count, explicit origin destination, remote SHA match and ahead/behind. List remaining unstaged/uncommitted files separately; unrelated preserved work need not be committed. On failure, identify which operations completed and where verification stopped. Never claim deployment.
