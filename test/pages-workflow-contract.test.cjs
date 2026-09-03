const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const yaml = require('js-yaml')

const root = path.resolve(__dirname, '..')
const workflowPath = path.join(root, '.github', 'workflows', 'pages.yml')

test('Pages workflow builds, tests, and deploys public with job-scoped permissions', () => {
  assert.equal(fs.existsSync(workflowPath), true, 'Pages workflow must exist')
  const workflow = yaml.load(fs.readFileSync(workflowPath, 'utf8'), {
    schema: yaml.JSON_SCHEMA
  })

  assert.equal(workflow.name, 'Deploy Hexo site to Pages')
  assert.deepEqual(workflow.on, {
    push: { branches: ['master'] },
    workflow_dispatch: null
  })
  assert.equal(workflow.permissions, undefined, 'permissions must be scoped to jobs')
  assert.deepEqual(workflow.concurrency, {
    group: 'pages',
    'cancel-in-progress': false
  })

  assert.deepEqual(workflow.jobs.build.permissions, { contents: 'read' })
  assert.equal(workflow.jobs.build['runs-on'], 'ubuntu-latest')
  assert.deepEqual(workflow.jobs.build.steps, [
    {
      name: 'Checkout',
      uses: 'actions/checkout@v4',
      with: { 'persist-credentials': false }
    },
    {
      name: 'Setup Node',
      uses: 'actions/setup-node@v4',
      with: { 'node-version': 22, cache: 'npm' }
    },
    { name: 'Install dependencies', run: 'npm ci' },
    { name: 'Build Hexo site', run: 'npm run build' },
    {
      name: 'Run Node tests',
      run: 'node --test --test-reporter=spec --test-reporter=./tools/github-actions-test-reporter.cjs --test-reporter-destination=stdout --test-reporter-destination=stdout test/*.test.cjs'
    },
    { name: 'Configure Pages', uses: 'actions/configure-pages@v5' },
    {
      name: 'Upload Pages artifact',
      uses: 'actions/upload-pages-artifact@v3',
      with: { path: './public' }
    }
  ])

  assert.equal(workflow.jobs.deploy['runs-on'], 'ubuntu-latest')
  assert.equal(workflow.jobs.deploy.needs, 'build')
  assert.deepEqual(workflow.jobs.deploy.permissions, {
    pages: 'write',
    'id-token': 'write'
  })
  assert.deepEqual(workflow.jobs.deploy.environment, {
    name: 'github-pages',
    url: '${{ steps.deployment.outputs.page_url }}'
  })
  assert.deepEqual(workflow.jobs.deploy.steps, [
    {
      name: 'Deploy to GitHub Pages',
      id: 'deployment',
      uses: 'actions/deploy-pages@v4'
    }
  ])
})
