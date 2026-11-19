# Plan and progress

Goal for Phase 1: when a PR is opened or updated, post one comment with a review plan. The plan lists the changed files grouped into chunks, in reading order, with a short summary of each chunk and noise files marked "skim only."

## Decisions

| # | Decision | Status |
| --- | --- | --- |
| 1 | Build in TypeScript with Probot | ✅ Agreed |
| 2 | Review TypeScript/JavaScript repos first | ✅ Went with the recommendation |
| 3 | AI service is switchable. Start with Claude Haiku (cheapest), each company brings its own API key | ✅ Agreed |
| 4 | No Redis for now, so it runs on a laptop | ✅ Went with the recommendation |
| 5 | Update the same comment on each push | ✅ Agreed |
| 6 | Review draft PRs too | ✅ Went with the recommendation |

## Done

- [x] Project setup (`package.json`, `tsconfig.json`, `.gitignore`, `.env.example`)
- [x] README with the full plan
- [x] Diff reader: [src/diff/parse-patch.ts](src/diff/parse-patch.ts) finds which lines changed
- [x] File labeller: [src/chunker/classify.ts](src/chunker/classify.ts) spots noise and tags each file (types, logic, config, tests, docs)
- [x] Chunker: [src/chunker/chunk.ts](src/chunker/chunk.ts) groups files and orders them for reading
- [x] Pushed to GitHub (`mfafore22/aicodechecker`)
- [x] AI wrapper: [src/llm/](src/llm/) summarizes each chunk and writes the overview. Switch services or models in `.env`.

- [x] Background queue: [src/queue.ts](src/queue.ts) runs reviews in the app itself, at most 2 at a time, one per PR, and only the newest push of each PR
- [x] Webhook server: [src/index.ts](src/index.ts) listens for opened, reopened and new-push events; [src/server.ts](src/server.ts) starts it
- [x] [app.yml](app.yml) so Probot's setup page creates the GitHub App with the right permissions
- [x] Tests for the diff reader, labeller, chunker, queue and webhook handler (66 tests in all)
- [x] Fixed: a new empty file was marked "binary". It's now "empty file"; binary files are recognised by extension
- [x] `npm test` works when VS Code opens the folder as `c:\` (lowercase), via [scripts/test.mjs](scripts/test.mjs)

- [x] Dry run: `npm run preview -- <PR>` prints the plan for any PR without posting ([src/preview.ts](src/preview.ts))
- [x] GitHub Actions runs the type-check and tests on every push and PR
- [x] Fixed: links to deleted files pointed at line 0; they now point at the old side of the diff

All the code type-checks and the tests pass, and the server starts. It has not yet been run against a real PR or a real API key.

## To do (in order)

1. [x] Agree on decisions 2, 4 and 6
2. [x] Download a PR's files from GitHub ([src/github/fetch-pr.ts](src/github/fetch-pr.ts))
3. [x] LLM wrapper that summarizes each chunk
4. [x] Build the comment text ([src/review/render.ts](src/review/render.ts))
5. [x] Post or update the comment on the PR ([src/github/comment.ts](src/github/comment.ts))
6. [x] Connect the steps into one pipeline ([src/pipeline.ts](src/pipeline.ts))
7. [x] Background queue ([src/queue.ts](src/queue.ts))
8. [x] Webhook server ([src/index.ts](src/index.ts), [src/server.ts](src/server.ts))
9. [x] Tests for the diff reader, labeller and chunker
10. [x] Fix known bug: a new empty file is wrongly marked "binary"
11. [ ] Create the GitHub App and try it on a real PR (steps in the README)
12. [ ] Adjust the chunking rules based on what real PRs show (try `npm run preview` on a few first)

We explain each step before building it.
