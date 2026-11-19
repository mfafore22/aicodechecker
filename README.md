# aicodechecker

A GitHub App that turns a large pull request into a short, ordered review plan. It splits the PR into chunks a reviewer can read one at a time, marks noise (lockfiles, generated code, formatting) as "skim only," and uses an LLM to say what each chunk changes, why, and what to check closely.

The full design is in [ARCHITECTURE.md](ARCHITECTURE.md). This README covers Phase 1 (the MVP): what it does, how it's built, and how to run it. Progress is tracked in [PLAN.md](PLAN.md).

> **Status: Phase 1 code complete, not yet tried on a real PR.** It type-checks, the tests pass, and the server starts. The next step is creating the GitHub App and running it on a test repo.

---

## Phase 1 (MVP) goal

When a PR is opened or updated on a repo where the app is installed, the app posts **one comment** on the PR that holds:

1. A short overview of what the PR does.
2. A checklist of chunks in reading order. Each chunk shows:
   - a one-line summary of what changed
   - why it changed, based on the PR description and linked issue
   - what the reviewer should check closely
   - links to the exact files and lines
3. A final "skim only" group for lockfiles, generated files, renames and whitespace-only edits.

When the PR gets new commits, the app updates the same comment instead of posting a new one.

**Not in Phase 1:** tree-sitter parsing, dependency-based grouping, duplicate detection, the repo index, Check Run annotations, and the dashboard. Those are Phases 2 to 4 in ARCHITECTURE.md.

### Example of the comment (draft)

```markdown
## Review plan
Adds rate limiting to the public API so one client can't exhaust the shared quota (fixes #42).

4 chunks · 11 files · +480 −62 · 3 files skim only

- [ ] **1. Types and interfaces: src/types**
  Adds a `RateLimitConfig` type and a `limit` field on `ApiClient`.
  Why: the limiter needs per-client settings (#42).
  Check closely: the defaults when `limit` is missing.
  Files: src/types/client.ts (+18 −2)
- [ ] **2. Logic: src/api** ...
- [ ] **3. Tests: src/api** ...
- [ ] **4. Skim only:** package-lock.json, dist/index.js, src/legacy.ts (whitespace)
```

---

## How Phase 1 works

```
GitHub PR event
  → webhook server        verifies the signature, queues a job, replies right away
  → queue                 runs the job in the background (in this process, no Redis)
  → fetch PR              title, description, changed files with diffs, linked issues
  → classify files        noise or real; types / logic / config / tests / docs
  → chunk                 group by folder, order for reading, split chunks that are too big
  → summarize             one LLM call per chunk, plus one for the overview
  → post comment          create the comment, or update it on later pushes
```

### Modules

| Module | Job |
| --- | --- |
| [src/server.ts](src/server.ts) | Starts the Probot server |
| [src/index.ts](src/index.ts) | Listens for PR events and queues a review |
| [src/queue.ts](src/queue.ts) | Runs reviews in the background: a few at a time, one per PR, newest push only |
| [src/github/fetch-pr.ts](src/github/fetch-pr.ts) | Gets the PR, its files and linked issues from the GitHub API |
| [src/diff/parse-patch.ts](src/diff/parse-patch.ts) | Reads each file's diff into hunks and changed line ranges |
| [src/chunker/classify.ts](src/chunker/classify.ts) | Marks noise and gives each file a role |
| [src/chunker/chunk.ts](src/chunker/chunk.ts) | Groups files into chunks and orders them |
| [src/llm/](src/llm/) | One interface for any LLM, with a Claude implementation |
| [src/review/render.ts](src/review/render.ts) | Builds the comment's Markdown |
| [src/github/comment.ts](src/github/comment.ts) | Creates or updates the comment |
| [src/pipeline.ts](src/pipeline.ts) | Runs the steps above in order and drops a review if a newer push arrived |
| [src/preview.ts](src/preview.ts) | `npm run preview`: prints the plan for any PR, posts nothing |
| [src/types.ts](src/types.ts) | Shared data types |

### How the chunker decides things

**Noise ("skim only"):**
- Lockfiles: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `go.sum`, `Cargo.lock`, `poetry.lock` and others.
- Generated files: `dist/`, `build/`, `coverage/`, `*.min.js`, `*.map`, and files whose first lines say `@generated` or `DO NOT EDIT`.
- Vendored code: `node_modules/`, `vendor/`, `third_party/`.
- Test snapshots: `__snapshots__/`, `*.snap`.
- Pure renames with no content change.
- Files with no line changes: binary files (recognised by extension, such as `.png` or `.zip`), new or deleted empty files, and permission-only changes.
- Edits that only change whitespace.

**File roles**, decided by path:
- tests: `*.test.ts`, `*.spec.ts`, `tests/`, `__tests__/`
- docs: `*.md`, `docs/`
- config: `package.json`, `tsconfig.json`, `.github/`, YAML, Dockerfiles, dotfiles
- types: `*.d.ts`, `types.ts`, `types/`, `interfaces/`, `models/`, `schemas/`
- logic: everything else

**Grouping and order:**
- Files with the same role and the same folder (two levels deep, such as `src/api`) go in one chunk.
- Chunks are ordered types → logic → config → tests → docs, with skim-only last.
- A chunk is split if it goes over 400 changed lines or about 60,000 characters of diff, so each LLM prompt stays small.
- If GitHub doesn't return a diff for a file because it's too large, the comment says so and tells the reviewer to read that file directly. The app never cuts a diff short without saying so.

---

## Decisions

| # | Decision | Choice |
| --- | --- | --- |
| 1 | Language for the app | TypeScript + Probot |
| 2 | Language reviewed first | TypeScript/JavaScript. Phase 1 rules are path-based, so other languages still get chunked; this decides which language Phase 2's tree-sitter work targets first. |
| 3 | LLM | Claude through a switchable wrapper. Default model `claude-haiku-5-5` (cheapest); change it with `LLM_MODEL`. |
| 4 | API keys and private code | Bring your own key: each install sets its own `ANTHROPIC_API_KEY`. |
| 5 | Queue | In-process, no Redis. Waiting reviews are lost on restart; the next push re-queues them. Revisit when running more than one server. |
| 6 | Updates | Each push updates the same comment. Ticked checkboxes reset. |
| 7 | Draft PRs | Reviewed too. |
| 8 | Hosting | Not decided (Fly.io, Railway, or any container host). |

### Open questions

- Should the comment show only one-line summaries, with the "why" and "check closely" details folded away under a toggle?
- Is there a cost limit per PR? For example, skip LLM calls past a set number of chunks.
- Which repo will we test on first?

---

## Running it

### Requirements

- Node.js 20 or newer
- A GitHub account where you can create an app
- An Anthropic API key

### Try it without the GitHub App

`npm run preview` builds the review plan for any PR and prints it, without posting anything:

```
npm run preview -- https://github.com/owner/repo/pull/123 --no-ai   # chunks only, free
npm run preview -- owner/repo#123                                    # with AI summaries
npm run preview -- owner/repo#123 > preview.md                       # save to a file
```

AI summaries need `ANTHROPIC_API_KEY` in `.env`. Public PRs work with no GitHub token (about 60 requests an hour). For private repos, or more requests, set `GITHUB_TOKEN`.

### First run: create the GitHub App

1. `npm install`
2. `npm run dev`, then open http://localhost:3000. With no app configured yet, Probot shows a setup page.
3. Click through it. It creates a GitHub App from [app.yml](app.yml) with the right permissions (pull requests: write; contents, issues, metadata: read; the Pull request event). It also creates a smee.io channel so GitHub events reach your laptop, and writes `APP_ID`, `PRIVATE_KEY`, `WEBHOOK_SECRET` and `WEBHOOK_PROXY_URL` into `.env`.
4. Add the rest of the settings from [.env.example](.env.example) to `.env`, at least `ANTHROPIC_API_KEY`.
5. Install the app on a test repo, restart `npm run dev`, and open a PR there.

To set the app up by hand instead, copy `.env.example` to `.env` and fill it in from the app's settings page on GitHub.

### Settings (`.env`)

| Setting | Default | What it does |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | (required) | Your Anthropic key |
| `LLM_MODEL` | `claude-haiku-5-5` | Model for summaries |
| `LLM_EFFORT` | `medium` | `low` to `max` |
| `LLM_CONCURRENCY` | `4` | Chunk summaries run at once, per review |
| `REVIEW_CONCURRENCY` | `2` | PRs reviewed at once |

### Commands

- `npm run dev`: run with auto-reload
- `npm run preview -- <PR>`: print the review plan for a PR without posting it
- `npm test`: run the tests
- `npm run typecheck`: check types
- `npm run build` then `npm start`: production build

GitHub Actions runs the type-check and tests on every push and PR ([.github/workflows/ci.yml](.github/workflows/ci.yml)).
