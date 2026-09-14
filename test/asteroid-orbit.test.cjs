const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('homepage does not load the legacy planet renderer', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert.doesNotMatch(html, /src="[^"]*\/planet-(?:core|surface)\.js/);
  assert.doesNotMatch(html, /saturn-system|planet-static-surface|id="planet-surface"/);
  for (const name of ['planet-core.js', 'planet-surface.js']) {
    assert.equal(fs.existsSync(path.join(__dirname, '../public/js', name)), false);
    assert.equal(fs.existsSync(path.join(__dirname, '../themes/fluid-particle/source/js', name)), false);
  }
});

test('asteroids orbit deterministically and share disposable assets', async () => {
  const THREE = await import('three');
  const { createExterior } = await import('../themes/fluid-particle/source/js/planet-world.mjs');
  const world = createExterior(THREE);
  const belt = world.group.getObjectByName('Orbiting asteroids');
  assert.equal(belt.children.length, 48);
  assert.equal(new Set(belt.children.map(rock => rock.geometry)).size, 1);
  for (const rock of belt.children) assert.ok(Math.hypot(rock.position.x, rock.position.y) > 2.6);
  world.update(10);
  assert.equal(belt.rotation.z, 10 * 0.045);
  world.update(10);
  assert.equal(belt.rotation.z, 10 * 0.045);
  let disposed = 0;
  belt.children[0].geometry.addEventListener('dispose', () => disposed++);
  world.dispose();
  assert.equal(disposed, 1);
});
