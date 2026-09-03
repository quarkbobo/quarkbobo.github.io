function escapeData(value) {
  return String(value)
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A')
}

function escapeProperty(value) {
  return escapeData(value)
    .replaceAll(':', '%3A')
    .replaceAll(',', '%2C')
}

function formatError(error) {
  if (error && typeof error === 'object') {
    if (typeof error.stack === 'string') return error.stack
    if (typeof error.message === 'string') return error.message
    return JSON.stringify(error)
  }
  return error == null ? 'Test failed' : String(error)
}

module.exports = async function* githubActionsTestReporter(source) {
  for await (const event of source) {
    if (event.type !== 'test:fail') continue

    const data = event.data || {}
    const name = data.name || '<unnamed test>'
    const error = data.details?.error

    yield `::error title=${escapeProperty(`Node test failed: ${name}`)}::${escapeData(formatError(error))}\n`
  }
}
