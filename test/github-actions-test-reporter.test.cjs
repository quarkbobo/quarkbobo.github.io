const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { pathToFileURL } = require('node:url')

const reporterPath = path.resolve(
  __dirname,
  '..',
  'tools',
  'github-actions-test-reporter.cjs'
)

async function collect(iterable) {
  const chunks = []
  for await (const chunk of iterable) chunks.push(chunk)
  return chunks.join('')
}

test('GitHub Actions reporter emits escaped annotations for failed tests only', async () => {
  const reporter = require(reporterPath)

  async function* events() {
    yield { type: 'test:pass', data: { name: 'passing test' } }
    yield {
      type: 'test:fail',
      data: {
        name: 'name: a, b',
        details: {
          error: { stack: 'first%second\r\nthird' }
        }
      }
    }
  }

  assert.equal(
    await collect(reporter(events())),
    '::error title=Node test failed%3A name%3A a%2C b::first%25second%0D%0Athird\n'
  )
})

test('GitHub Actions reporter still emits useful annotations without a source location', async () => {
  const reporter = require(reporterPath)

  async function* events() {
    yield {
      type: 'test:fail',
      data: {
        name: 'suite setup',
        details: { error: { message: 'setup failed' } }
      }
    }
  }

  assert.equal(
    await collect(reporter(events())),
    '::error title=Node test failed%3A suite setup::setup failed\n'
  )
})

test('Node test runner preserves spec output and adds one annotation for a failure', () => {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'quarkbobo-reporter-'))
  const fixturePath = path.join(fixtureDirectory, 'fixture.test.cjs')
  const childEnvironment = { ...process.env }
  delete childEnvironment.NODE_TEST_CONTEXT

  try {
    fs.writeFileSync(
      fixturePath,
      "const test = require('node:test')\n\n" +
        "test('fixture failure: colon, comma', () => {\n" +
        "  throw new Error('fixture detail\\nsecond line')\n" +
        '})\n',
      'utf8'
    )

    const result = spawnSync(
      process.execPath,
      [
        '--test',
        '--test-reporter=spec',
        `--test-reporter=${pathToFileURL(reporterPath).href}`,
        '--test-reporter-destination=stdout',
        '--test-reporter-destination=stdout',
        fixturePath
      ],
      { encoding: 'utf8', env: childEnvironment }
    )
    const output = `${result.stdout || ''}${result.stderr || ''}`

    assert.notEqual(
      result.status,
      0,
      JSON.stringify({ error: result.error?.message, stdout: result.stdout, stderr: result.stderr })
    )
    assert.match(output, /fixture failure: colon, comma/)
    assert.match(
      output,
      /::error title=Node test failed%3A fixture failure%3A colon%2C comma::/
    )
    assert.match(output, /%0A/)
    assert.equal(
      output.match(/::error title=Node test failed/g)?.length,
      1
    )
  } finally {
    fs.rmSync(fixtureDirectory, { recursive: true, force: true })
  }
})
