const fs = require('node:fs')
const path = require('node:path')
const median = values => [...values].sort((a, b) => a - b)[1]
const read = folder => {
  const runs = [1, 2, 3].map(n => {
    const log = fs.readFileSync(path.join(__dirname, folder, `perf-${n}.log`), 'utf8')
    if (!log.includes('Exit code: 0')) throw new Error(`Failed performance run ${folder}/${n}`)
    return JSON.parse(log.slice(log.indexOf('{'), log.lastIndexOf('}') + 1))
  })
  return { runs, median: Object.fromEntries(['approach', 'interior'].map(phase => [phase, Object.fromEntries(['averageFPS', 'p95FrameMs', 'medianFrameMs'].map(key => [key, median(runs.map(run => run[phase][key]))]))])) }
}
const baseline = read('baseline')
const final = read('final')
const improvementPercent = +(100 * (1 - final.median.approach.p95FrameMs / baseline.median.approach.p95FrameMs)).toFixed(1)
const checks = {
  entryP95Improves20Percent: final.median.approach.p95FrameMs <= baseline.median.approach.p95FrameMs * 0.8,
  entryFPSDoesNotDecrease: final.median.approach.averageFPS >= baseline.median.approach.averageFPS,
  interiorP95Within10Percent: final.median.interior.p95FrameMs <= baseline.median.interior.p95FrameMs * 1.1
}
const report = { environment: baseline.runs[0].environment, baseline, final, improvementPercent, checks }
fs.writeFileSync(path.join(__dirname, 'final/performance-comparison.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify({ baseline: baseline.median, final: final.median, improvementPercent, checks }, null, 2))
if (Object.values(checks).some(value => !value)) process.exitCode = 1
