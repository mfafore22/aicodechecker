# aicodechecker

A GitHub App that turns a large pull request into a short, ordered review plan. It splits the PR into chunks a reviewer can read one at a time, marks noise (lockfiles, generated code, formatting) as "skim only," and uses an LLM to say what each chunk changes, why, and what to check closely.

The full design is in [ARCHITECTURE.md](ARCHITECTURE.md). This README covers the plan for Phase 1 (the MVP), the decisions that still need sign-off, and what exists so far.

> **Status: planning.** Some early code exists (listed below) but the app does not run yet. Nothing has been tested or type-checked.

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
  → queue                 runs the job in the background
  → fetch PR              title, description, changed files with diffs, linked issues
  → classify files        noise or real; types / logic / config / tests / docs
  → chunk                 group by folder, order for reading, split chunks that are too big
  → summarize             one LLM call per chunk, plus one for the overview
  → post comment          create the comment, or update it on later pushes
```

### Planned modules

| Module | Job | State |
| --- | --- | --- |
| `src/server.ts` | Starts the Probot server | Not written |
| `src/index.ts` | Listens for PR events and queues a job | Not written |
| `src/queue.ts` | Background jobs: in-process by default, Redis + BullMQ when `REDIS_URL` is set | Not written |
| `src/github/fetch-pr.ts` | Gets the PR, its files and linked issues from the GitHub API | Not written |
| `src/diff/parse-patch.ts` | Reads each file's diff into hunks and changed line ranges | **Draft written** |
| `src/chunker/classify.ts` | Marks noise and gives each file a role | **Draft written** |
| `src/chunker/chunk.ts` | Groups files into chunks and orders them | **Draft written** |
| `src/llm/provider.ts` | One interface for any LLM, so models can be swapped | Not written |
| `src/llm/anthropic.ts` | Claude implementation of that interface | Not written |
| `src/review/render.ts` | Builds the comment's Markdown | Not written |
| `src/github/comment.ts` | Creates or updates the comment | Not written |
| `src/pipeline.ts` | Runs the steps above in order | Not written |
| `src/types.ts` | Shared data types | **Draft written** |

### How the chunker decides things (draft rules, open to change)

**Noise ("skim only"):**
- Lockfiles: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `go.sum`, `Cargo.lock`, `poetry.lock` and others.
- Generated files: `dist/`, `build/`, `coverage/`, `*.min.js`, `*.map`, and files whose first lines say `@generated` or `DO NOT EDIT`.
- Vendored code: `node_modules/`, `vendor/`, `third_party/`.
- Test snapshots: `__snapshots__/`, `*.snap`.
- Pure renames with no content change, and binary files.
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

## Decisions that need your sign-off

The draft code follows the choices marked **(proposed)**. None of them are final.

| # | Decision | Proposed | Alternatives |
| --- | --- | --- | --- |
| 1 | Language for the app | **TypeScript + Probot** (proposed, as ARCHITECTURE.md suggests) | Python + FastAPI |
| 2 | Language reviewed in Phase 1 | **TypeScript/JavaScript** (proposed). The Phase 1 rules are mostly path-based, so other languages still get chunked; this choice decides which language Phase 2's tree-sitter work targets first. | Python, other |
| 3 | LLM | **Claude** through one wrapper (proposed). Model `claude-opus-5-5`, changeable with `LLM_MODEL`. | OpenAI, or support both from day one |
| 4 | API keys and private code | **Bring your own key** (proposed): each install sets its own `ANTHROPIC_API_KEY`. | Self-hosted model; a hosted key we pay for |
| 5 | Queue | **In-process queue by default, Redis + BullMQ when `REDIS_URL` is set** (proposed). This runs on Windows without installing Redis. | Redis required from day one |
| 6 | Chunk checklist | **Re-posting after a new push resets the ticked boxes** (proposed, simplest). | Keep ticks for chunks whose files didn't change |
| 7 | Draft PRs | **Review them too** (proposed). | Wait until "ready for review" |
| 8 | Hosting | **Not decided** | Fly.io, Railway, any container host |

### Open questions

- Should the comment show only one-line summaries, with the "why" and "check closely" details folded away under a toggle?
- Is there a cost limit per PR? For example, skip LLM calls past a set number of chunks.
- Which repo will we test on first?

---

## GitHub App setup (planned)

You'll need these once the app runs. Nothing to do yet.

1. Create a GitHub App with these permissions:
   - Pull requests: **read & write** (to read the diff and post the comment)
   - Contents: **read**
   - Issues: **read** (for linked issues)
   - Metadata: **read**
2. Subscribe it to the **Pull request** event.
3. Copy `.env.example` to `.env` and fill in the App ID, private key path, webhook secret and `ANTHROPIC_API_KEY`.
4. For local testing, create a channel at https://smee.io and put its URL in `WEBHOOK_PROXY_URL` so GitHub events reach your machine.
5. Run `npm install`, then `npm run dev`.

### Requirements

- Node.js 20 or newer (this machine has 22)
- A GitHub account where you can create an app
- An Anthropic API key
- Optional: Redis, only if decision 5 changes

---

## Build order once the plan is approved

1. Agree on the decisions above.
2. Finish the remaining modules in this order: fetch PR, LLM wrapper, comment renderer, pipeline, queue, webhook server.
3. Add tests for the diff parser, classifier, chunker and renderer.
4. Install the app on a test repo and run it on a few real PRs.
5. Adjust the chunking rules based on what those runs show.
