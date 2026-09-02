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
