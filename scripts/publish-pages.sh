#!/usr/bin/env bash
# Publish a built directory into the GitHub Pages branch with plain git, so a
# production release at the branch root and per-branch previews under
# preview/<slug>/ can live side by side in the same branch.
#
# Inputs (environment variables):
#   SOURCE_DIR         Directory to publish. Default: .pages-dist
#   DESTINATION        '' publishes to the site root; otherwise a relative path
#                      such as preview/<slug>. Default: '' (root)
#   DELETE_DESTINATION 1 removes DESTINATION instead of publishing into it.
#                      REMOVE_ONLY=1 is accepted as an alias.
#   PAGES_REMOTE       Git URL, local path, or the name of a remote of the
#                      current repository. Default: origin
#   PAGES_BRANCH       Branch that GitHub Pages serves. Default: gh-pages
#   COMMIT_MESSAGE     Commit message. Default: derived from the destination.
#   GIT_AUTHOR_NAME    Commit identity (author and committer). Defaults to the
#   GIT_AUTHOR_EMAIL   github-actions[bot] identity.
#   PAGES_URL_BASE     When set, the published URL is printed, e.g.
#                      https://<owner>.github.io/<repo>
#   PUBLISH_PAGES_MAX_ATTEMPTS  Push attempts before giving up. Default: 5
#   PUBLISH_PAGES_RETRY_DELAY   Seconds between attempts. Default: 3
#   PUBLISH_PAGES_TEST_HOOK     Test seam: an executable run once after the
#                               first commit and before the first push.
#
# Behaviour:
#   * A root deploy removes every tracked file except preview/ and .nojekyll,
#     then copies SOURCE_DIR into the root, so production never deletes previews.
#   * A preview deploy removes DESTINATION completely and copies SOURCE_DIR
#     into it, so stale files from an earlier preview never linger.
#   * .nojekyll always exists at the root.
#   * Nothing is committed when the tree is unchanged.
#   * A rejected push (someone else published meanwhile) is retried: fetch,
#     reset to the new tip, re-apply the same changes, commit and push again.
#
# Outputs: when GITHUB_OUTPUT is set, `url`, `commit` and `changed` are written.
set -euo pipefail

SOURCE_DIR="${SOURCE_DIR:-.pages-dist}"
DESTINATION="${DESTINATION:-}"
DELETE_DESTINATION="${DELETE_DESTINATION:-${REMOVE_ONLY:-0}}"
PAGES_REMOTE="${PAGES_REMOTE:-origin}"
PAGES_BRANCH="${PAGES_BRANCH:-gh-pages}"
COMMIT_MESSAGE="${COMMIT_MESSAGE:-}"
PAGES_URL_BASE="${PAGES_URL_BASE:-}"
MAX_ATTEMPTS="${PUBLISH_PAGES_MAX_ATTEMPTS:-5}"
RETRY_DELAY="${PUBLISH_PAGES_RETRY_DELAY:-3}"
TEST_HOOK="${PUBLISH_PAGES_TEST_HOOK:-}"

export GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME:-github-actions[bot]}"
export GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-41898282+github-actions[bot]@users.noreply.github.com}"
export GIT_COMMITTER_NAME="${GIT_COMMITTER_NAME:-$GIT_AUTHOR_NAME}"
export GIT_COMMITTER_EMAIL="${GIT_COMMITTER_EMAIL:-$GIT_AUTHOR_EMAIL}"
export GIT_TERMINAL_PROMPT=0

log() { printf '%s\n' "$*"; }
fail() { printf 'publish-pages: %s\n' "$*" >&2; exit 1; }

# --- Validate inputs --------------------------------------------------------

# Normalise the destination: no leading ./, no trailing slash.
DESTINATION="${DESTINATION#./}"
DESTINATION="${DESTINATION%/}"
case "$DESTINATION" in
  '') ;;
  /*) fail "DESTINATION must be relative to the site root: $DESTINATION" ;;
  ..|../*|*/..|*/../*|.|./*|*/./*) fail "DESTINATION may not contain . or .. segments: $DESTINATION" ;;
  .git|.git/*) fail "DESTINATION may not be inside .git: $DESTINATION" ;;
esac

if [ "$DELETE_DESTINATION" = 1 ]; then
  [ -n "$DESTINATION" ] || fail "DELETE_DESTINATION=1 needs a non-empty DESTINATION (refusing to empty the site root)"
else
  [ -d "$SOURCE_DIR" ] || fail "SOURCE_DIR is not a directory: $SOURCE_DIR (run the build first)"
  SOURCE_DIR="$(cd "$SOURCE_DIR" && pwd)"
  [ -n "$(ls -A "$SOURCE_DIR")" ] || fail "SOURCE_DIR is empty: $SOURCE_DIR"
fi

# A remote name of the current repository resolves to its URL. A local
# directory becomes an absolute file:// URL so it still works after changing
# directory and so shallow clones behave as they do over HTTPS.
if remote_url="$(git remote get-url "$PAGES_REMOTE" 2>/dev/null)"; then
  PAGES_REMOTE="$remote_url"
elif [ -d "$PAGES_REMOTE" ]; then
  PAGES_REMOTE="file://$(cd "$PAGES_REMOTE" && pwd)"
fi

if [ -z "$COMMIT_MESSAGE" ]; then
  if [ "$DELETE_DESTINATION" = 1 ]; then
    COMMIT_MESSAGE="Remove $DESTINATION"
  else
    COMMIT_MESSAGE="Publish ${DESTINATION:-site root}"
  fi
  if [ -n "${GITHUB_SHA:-}" ]; then
    COMMIT_MESSAGE="$COMMIT_MESSAGE from ${GITHUB_SHA:0:7}"
  fi
fi

# --- Prepare a working clone of the pages branch ----------------------------

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
WORK_DIR="$TMP_DIR/pages"

branch_status=0
git ls-remote --exit-code --heads "$PAGES_REMOTE" "refs/heads/$PAGES_BRANCH" >/dev/null 2>&1 || branch_status=$?
case "$branch_status" in
  0)
    log "Cloning $PAGES_BRANCH"
    git clone --quiet --branch "$PAGES_BRANCH" --depth 1 --single-branch "$PAGES_REMOTE" "$WORK_DIR"
    ;;
  2)
    if [ "$DELETE_DESTINATION" = 1 ]; then
      log "Branch $PAGES_BRANCH does not exist; nothing to remove"
      exit 0
    fi
    log "Branch $PAGES_BRANCH does not exist yet; creating it"
    git init --quiet "$WORK_DIR"
    git -C "$WORK_DIR" remote add origin "$PAGES_REMOTE"
    git -C "$WORK_DIR" checkout --quiet --orphan "$PAGES_BRANCH"
    ;;
  *)
    fail "cannot reach $PAGES_REMOTE (git ls-remote exited with $branch_status)"
    ;;
esac

cd "$WORK_DIR"

# --- Apply the requested change to the working tree -------------------------
# Re-runnable: the retry loop calls it again after resetting to a newer tip.

apply_changes() {
  if [ "$DELETE_DESTINATION" = 1 ]; then
    rm -rf -- "${DESTINATION:?}"
  elif [ -z "$DESTINATION" ]; then
    # Production: replace the root but keep every preview and .nojekyll.
    git ls-files -z | while IFS= read -r -d '' file; do
      case "$file" in
        preview/*|.nojekyll) ;;
        *) rm -f -- "$file" ;;
      esac
    done
    cp -R "$SOURCE_DIR"/. .
  else
    rm -rf -- "$DESTINATION"
    mkdir -p -- "$DESTINATION"
    cp -R "$SOURCE_DIR"/. "$DESTINATION"/
  fi
  # GitHub Pages must serve the files verbatim (no Jekyll processing).
  touch .nojekyll
  git add -A .
}

# Returns 1 when the index matches HEAD (or is empty on an unborn branch).
commit_changes() {
  if git diff --cached --quiet; then
    return 1
  fi
  git commit --quiet -m "$COMMIT_MESSAGE"
}

# --- Commit and push, retrying when someone else pushed meanwhile ------------

attempt=1
while :; do
  apply_changes
  if ! commit_changes; then
    log "No changes to publish"
    if [ -n "${GITHUB_OUTPUT:-}" ]; then
      printf 'changed=false\n' >> "$GITHUB_OUTPUT"
    fi
    exit 0
  fi
  if [ "$attempt" -eq 1 ] && [ -n "$TEST_HOOK" ]; then
    "$TEST_HOOK" "$WORK_DIR"
  fi
  if git push origin "HEAD:refs/heads/$PAGES_BRANCH"; then
    break
  fi
  if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
    fail "push to $PAGES_BRANCH rejected after $attempt attempts"
  fi
  attempt=$((attempt + 1))
  log "Push rejected; retrying ($attempt of $MAX_ATTEMPTS)"
  sleep "$RETRY_DELAY"
  git fetch --quiet --depth 1 origin "+refs/heads/$PAGES_BRANCH:refs/remotes/origin/$PAGES_BRANCH"
  git reset --quiet --hard "origin/$PAGES_BRANCH"
  git clean --quiet -fd
done

commit="$(git rev-parse HEAD)"
if [ "$DELETE_DESTINATION" = 1 ]; then
  log "Removed $DESTINATION from $PAGES_BRANCH ($commit)"
else
  log "Published ${DESTINATION:-site root} to $PAGES_BRANCH ($commit)"
fi

url=''
if [ -n "$PAGES_URL_BASE" ] && [ "$DELETE_DESTINATION" != 1 ]; then
  url="${PAGES_URL_BASE%/}/"
  if [ -n "$DESTINATION" ]; then
    url="${url}${DESTINATION}/"
  fi
  log "URL: $url"
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    printf 'changed=true\n'
    printf 'commit=%s\n' "$commit"
    printf 'url=%s\n' "$url"
  } >> "$GITHUB_OUTPUT"
fi
