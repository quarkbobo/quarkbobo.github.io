# GitHub Pages Hexo Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically build and publish the Hexo site to `https://quarkbobo.github.io/` after every push to `master`.

**Architecture:** A repository-local GitHub Actions workflow installs the locked npm dependencies, builds Hexo into `public/`, uploads that directory as the Pages artifact, and deploys it through GitHub's official Pages action. A Node contract test parses the workflow as text and protects its trigger, permissions, build command, artifact path, and deployment action.

**Tech Stack:** GitHub Actions, Node.js 22, npm, Hexo, Node's built-in test runner

## Global Constraints

- Trigger automatically only for pushes to `master`, with an additional manual `workflow_dispatch` trigger.
- Install dependencies with `npm ci` and build with `npm run build`.
- Publish only the generated `public/` directory.
- Use the official GitHub Pages Actions and the minimum `contents: read`, `pages: write`, and `id-token: write` permissions.
- Do not commit `public/`, change Hexo or theme dependencies, add a custom domain, or modify site content and visual design.

---

### Task 1: Pages workflow contract and implementation

**Files:**
- Create: `test/pages-workflow-contract.test.cjs`
- Create: `.github/workflows/pages.yml`

**Interfaces:**
- Consumes: `package-lock.json`, the `build` script in `package.json`, and Hexo output at `public/`.
- Produces: a GitHub Actions workflow named `Deploy Hexo site to Pages` and a regression test executed by the existing `node --test test/*.test.cjs` command.

- [ ] **Step 1: Write the failing workflow contract test**

```js
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const workflowPath = path.join(root, '.github', 'workflows', 'pages.yml')

test('Pages workflow builds Hexo from master and deploys public with least privilege', () => {
  assert.equal(fs.existsSync(workflowPath), true, 'Pages workflow must exist')
  const workflow = fs.readFileSync(workflowPath, 'utf8')

  for (const required of [
    'Deploy Hexo site to Pages',
    'branches: ["master"]',
    'workflow_dispatch:',
    'contents: read',
    'pages: write',
    'id-token: write',
    'actions/checkout@v4',
    'actions/setup-node@v4',
    'node-version: 22',
    'cache: npm',
    'run: npm ci',
    'run: npm run build',
    'actions/configure-pages@v5',
    'actions/upload-pages-artifact@v3',
    'path: ./public',
    'actions/deploy-pages@v4',
    'name: github-pages',
    'cancel-in-progress: false'
  ]) {
    assert.match(workflow, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `missing: ${required}`)
  }
})
```

- [ ] **Step 2: Run the new test and verify the expected failure**

Run: `node --test test/pages-workflow-contract.test.cjs`

Expected: FAIL with `Pages workflow must exist` because `.github/workflows/pages.yml` has not been created.

- [ ] **Step 3: Add the minimal Pages workflow**

```yaml
name: Deploy Hexo site to Pages

on:
  push:
    branches: ["master"]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Build Hexo site
        run: npm run build
      - name: Configure Pages
        uses: actions/configure-pages@v5
      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./public

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `node --test test/pages-workflow-contract.test.cjs`

Expected: PASS with one passing test and zero failures.

- [ ] **Step 5: Run the full local verification suite**

Run: `npm run test:fresh`

Expected: Hexo generates `public/index.html`; every Node test passes with zero failures.

- [ ] **Step 6: Commit the tested workflow**

```bash
git add test/pages-workflow-contract.test.cjs .github/workflows/pages.yml
git commit -m "ci: deploy Hexo site to GitHub Pages"
```

### Task 2: Publish and verify the live site

**Files:**
- Verify only: `.github/workflows/pages.yml`
- Verify only: generated GitHub Pages deployment

**Interfaces:**
- Consumes: the committed workflow on `master` and GitHub Pages repository settings.
- Produces: a successful Pages deployment reachable at `https://quarkbobo.github.io/`.

- [ ] **Step 1: Push the implementation commits**

Run: `git push origin master`

Expected: the remote `master` advances to the local commit and starts `Deploy Hexo site to Pages`.

- [ ] **Step 2: Inspect the Actions deployment result**

Open the repository Actions page and inspect the newest `Deploy Hexo site to Pages` run.

Expected: both `build` and `deploy` jobs complete successfully. If deployment reports that Pages must use GitHub Actions, change the repository Pages source to `GitHub Actions`, then re-run the failed workflow.

- [ ] **Step 3: Verify the public URL independently**

Open `https://quarkbobo.github.io/` in a fresh or reloaded browser tab.

Expected: the title is `博客目录 · Quark's Blog`, the page contains `在噪声里，保留信号。`, and the response is no longer GitHub's `404 File not found` page.

- [ ] **Step 4: Record final repository state**

Run: `git status --short --branch`

Expected: output is exactly `## master` with no staged, unstaged, or untracked files.
