# Plan and progress

Goal for Phase 1: when a PR is opened or updated, post one comment with a review plan. The plan lists the changed files grouped into chunks, in reading order, with a short summary of each chunk and noise files marked "skim only."

## Decisions

| # | Decision | Status |
| --- | --- | --- |
| 1 | Build in TypeScript with Probot | ✅ Agreed |
| 2 | Review TypeScript/JavaScript repos first | ⏳ Waiting on you |
| 3 | AI service is switchable. Start with Claude Haiku (cheapest), each company brings its own API key | ✅ Agreed |
| 4 | No Redis for now, so it runs on a laptop | ⏳ Waiting on you |
| 5 | Update the same comment on each push | ⏳ Waiting on you |
| 6 | Review draft PRs too | ⏳ Waiting on you |

## Done

- [x] Project setup (`package.json`, `tsconfig.json`, `.gitignore`, `.env.example`)
- [x] README with the full plan
- [x] Diff reader: [src/diff/parse-patch.ts](src/diff/parse-patch.ts) finds which lines changed
- [x] File labeller: [src/chunker/classify.ts](src/chunker/classify.ts) spots noise and tags each file (types, logic, config, tests, docs)
- [x] Chunker: [src/chunker/chunk.ts](src/chunker/chunk.ts) groups files and orders them for reading
- [x] Pushed to GitHub (`mfafore22/aicodechecker`)
- [x] AI wrapper: [src/llm/](src/llm/) summarizes each chunk and writes the overview. Switch services or models in `.env`.

All the code type-checks, but none of it has been run against a real PR or a real API key yet.

## To do (in order)

1. [ ] Agree on decisions 2, 4, 5 and 6
2. [ ] Download a PR's files from GitHub
3. [x] LLM wrapper that summarizes each chunk
4. [ ] Build the comment text
5. [ ] Post or update the comment on the PR
6. [ ] Connect the steps into one pipeline
7. [ ] Background queue
8. [ ] Webhook server (receives GitHub events)
9. [ ] Tests for the diff reader, labeller and chunker
10. [ ] Fix known bug: a new empty file is wrongly marked "binary"
11. [ ] Create the GitHub App and try it on a real PR

We explain each step before building it.
