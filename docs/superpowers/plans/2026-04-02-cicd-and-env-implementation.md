# CI/CD and Environment Layering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-pass CI/CD setup, unify local environment loading across Next.js and Prisma, and replace the template README with project-specific setup and deployment docs.

**Architecture:** Keep CI and CD separate in GitHub Actions, push all server deployment logic into one shell script, and introduce a small env-loader module that selects `.env.local`, `.env.test`, or `.env.production` based on an explicit app target instead of hard-coding `.env.local`. Wire package scripts and Prisma through the same loader so local commands behave consistently.

**Tech Stack:** Next.js 16, Prisma 7, Vitest, GitHub Actions, Node.js, shell scripting

---

## File Map

- Create: `scripts/env.ts`
- Create: `scripts/deploy.sh`
- Create: `.env.example`
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/deploy.yml`
- Create: `src/lib/env-loader.test.ts`
- Modify: `package.json`
- Modify: `prisma.config.ts`
- Modify: `README.md`
- Modify: `.gitignore` if needed to clarify the new env file policy

### Task 1: Build a shared env loader for app commands and Prisma

**Files:**
- Create: `scripts/env.ts`
- Create: `src/lib/env-loader.test.ts`
- Modify: `prisma.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing env-loader tests**

Add tests in `src/lib/env-loader.test.ts` that cover:
- default target resolves to `.env.local`
- `APP_ENV=test` resolves to `.env.test`
- `APP_ENV=production` resolves to `.env.production`
- loader sets variables onto `process.env` without requiring Next.js to change `NODE_ENV`

- [ ] **Step 2: Run the env-loader test to verify it fails**

Run: `npm run test -- src/lib/env-loader.test.ts`
Expected: FAIL because the loader module does not exist yet

- [ ] **Step 3: Write the minimal env loader**

Implement `scripts/env.ts` with focused helpers:
- read `APP_ENV`
- map it to one env file
- load the target file with `dotenv`
- inject values into `process.env` without overwriting already-set keys unless explicitly intended
- expose a small API that Prisma config and command wrappers can reuse

- [ ] **Step 4: Update `prisma.config.ts` to use the shared loader**

Replace the hard-coded `dotenv.config({ path: ".env.local" })` call with the shared loader so Prisma follows the same target env selection as app commands.

- [ ] **Step 5: Add package scripts for local, test, and pro targets**

Add scripts such as:
- `dev`
- `dev:local`
- `dev:test`
- `dev:pro`
- any minimal Prisma helper scripts needed to prove the loader works consistently

The wrappers should keep `next dev` in development mode and only switch the selected env file through `APP_ENV`.

- [ ] **Step 6: Run the env-loader test to verify it passes**

Run: `npm run test -- src/lib/env-loader.test.ts`
Expected: PASS

- [ ] **Step 7: Run the broader test suite and lint**

Run:
- `npm run test`
- `npm run lint`

Expected: PASS

### Task 2: Add environment examples and a deployment script template

**Files:**
- Create: `.env.example`
- Create: `scripts/deploy.sh`
- Modify: `.gitignore` if the ignore policy needs clarification

- [ ] **Step 1: Write a failing test or validation checkpoint for the deploy template**

Use a lightweight validation target instead of a unit test:
- make sure `scripts/deploy.sh` is absent before creation
- define the required deploy stages from the spec

- [ ] **Step 2: Create `.env.example` with safe placeholder values**

Include:
- `DATABASE_URL`
- `SILICONFLOW_API_KEY`
- `SILICONFLOW_BASE_URL`
- `SILICONFLOW_MODEL`

Do not include real secrets.

- [ ] **Step 3: Add `scripts/deploy.sh` as the canonical server deploy script**

Include:
- `set -e`
- project directory change
- `git pull origin main`
- dependency install
- `npx prisma migrate deploy`
- `npm run build`
- `pm2 restart ai-chat`
- health check

Use clear log lines so GitHub Actions output stays readable.

- [ ] **Step 4: Verify the deploy script is at least shell-parseable**

Run: `bash -n scripts/deploy.sh`
Expected: PASS

### Task 3: Add GitHub Actions workflows for CI and deployment

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Write a validation checklist for workflow behavior**

Checklist:
- CI runs on PRs to `main`
- CI runs on pushes to `main`
- Deploy only runs after CI succeeds on `main`
- CI includes install, lint, test, and build
- Deploy uses SSH secrets and runs `scripts/deploy.sh`

- [ ] **Step 2: Create `ci.yml`**

Implement a single job that:
- checks out the repo
- sets up Node
- runs `npm ci`
- provides safe placeholder env values if build needs them
- runs `npm run lint`
- runs `npm run test`
- runs `npm run build`

- [ ] **Step 3: Create `deploy.yml`**

Implement a workflow that:
- listens to CI success via `workflow_run`
- gates on the `main` branch
- prepares SSH config from GitHub Secrets
- connects to the server
- runs the canonical deploy script in the project directory

- [ ] **Step 4: Validate workflow YAML**

Run:
- `npx eslint .github/workflows/ci.yml .github/workflows/deploy.yml` if the config supports YAML
- otherwise use manual review plus `git diff`

Expected: files are syntactically sound and readable

### Task 4: Replace the template README with project-specific documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Define the README sections before rewriting**

Sections:
- project overview
- stack
- local setup
- env files
- scripts
- testing
- deployment architecture
- CI/CD flow

- [ ] **Step 2: Rewrite `README.md`**

Document:
- what the app does
- how to install and start it locally
- what `.env.example`, `.env.local`, `.env.test`, and `.env.production` mean
- what `dev`, `dev:test`, and `dev:pro` do
- how the server deployment currently works
- what GitHub Secrets are required for CD

- [ ] **Step 3: Review README against the spec**

Check that a new contributor could answer:
- how do I run this locally?
- which env file should I use?
- how does deployment work?

### Task 5: Run end-to-end verification

**Files:**
- Modify: any of the above if verification finds gaps

- [ ] **Step 1: Run focused verification for the env loader**

Run:
- `npm run test -- src/lib/env-loader.test.ts`

Expected: PASS

- [ ] **Step 2: Run repository verification**

Run:
- `npm run lint`
- `npm run test`
- `npm run build`

Expected: PASS

- [ ] **Step 3: Review final diff**

Run: `git diff --stat`
Expected: only the planned files changed

- [ ] **Step 4: Capture follow-up items if GitHub-side verification cannot be run locally**

Document any manual follow-up needed, especially:
- adding GitHub Secrets
- copying `scripts/deploy.sh` to the server if required
- validating the first real `workflow_run` deployment
