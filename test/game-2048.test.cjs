const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('source/2048/index.html', 'utf8');
function rules() {
  const source = html.match(/<script id="rules2048">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(source, '2048 must provide the executable move rules used by the board');
  const context = vm.createContext({});
  vm.runInContext(source, context);
  return {
    move: (board, direction) => JSON.parse(JSON.stringify(context.calculateMove(board, direction))),
    won: context.hasWon,
    over: context.isGameOver,
  };
}
const empty = () => Array.from({ length: 4 }, () => [0, 0, 0, 0]);

test('2048 merges each source tile once, with actual slide origins and score', () => {
  const game = rules();
  const board = empty();
  board[0] = [2, 2, 2, 2];
  board[1] = [2, 2, 4, 0];
  const result = game.move(board, 'left');
  assert.deepEqual(result.grid[0], [4, 4, 0, 0]);
  assert.deepEqual(result.grid[1], [4, 4, 0, 0]);
  assert.equal(result.gain, 12);
  assert.equal(result.changed, true);
  assert.deepEqual(result.slides[3], { value: 2, from: [0, 3], to: [0, 1] });
  assert.deepEqual(board[0], [2, 2, 2, 2], 'calculating a move must not mutate the displayed board before its slide');
});

test('2048 respects right, up and down edge ordering', () => {
  const game = rules();
  const row = empty();
  row[0] = [2, 2, 4, 4];
  assert.deepEqual(game.move(row, 'right').grid[0], [0, 0, 4, 8]);
  const column = [[2, 0, 0, 0], [2, 0, 0, 0], [4, 0, 0, 0], [4, 0, 0, 0]];
  assert.deepEqual(game.move(column, 'up').grid.map(row => row[0]), [4, 8, 0, 0]);
  assert.deepEqual(game.move(column, 'down').grid.map(row => row[0]), [0, 0, 4, 8]);
});

test('2048 marks blocked moves unchanged so they cannot spawn a new tile', () => {
  const board = empty();
  board[0] = [2, 4, 8, 16];
  const result = rules().move(board, 'left');
  assert.equal(result.changed, false);
  assert.equal(result.gain, 0);
  assert.deepEqual(result.grid, board);
});

test('2048 victory requires a 2048 tile, not a cumulative score', () => {
  const game = rules();
  assert.equal(game.won([[512, 512, 512, 512], ...empty().slice(1)], 10000), false);
  assert.equal(game.won([[2048, 0, 0, 0], ...empty().slice(1)], 0), true);
});

test('2048 only ends when no empty cell or horizontal or vertical merge remains', () => {
  const game = rules();
  const full = [[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]];
  assert.equal(game.over(full), true);
  full[3][3] = 0;
  assert.equal(game.over(full), false);
  full[3][3] = 4;
  assert.equal(game.over(full), false);
  full[3][3] = 2;
  full[2][3] = 2;
  assert.equal(game.over(full), false);
});

// The DOM is only a host for the real inline application; timers advance deterministically.
function application({ storageError = false } = {}) {
  const elements = new Map(), storage = new Map(), timers = new Map();
  let now = 0, nextTimer = 0;
  function element() {
    return {
      children: [], dataset: {}, hidden: false, textContent: '', handlers: {}, clientWidth: 500,
      style: { setProperty() {} }, classList: { add() {}, remove() {} },
      append(child) { this.children.push(child); }, replaceChildren() { this.children = []; },
      setAttribute() {}, focus() {}, remove() {}, setPointerCapture() {},
      addEventListener(type, callback) { this.handlers[type] = callback; },
      querySelector(selector) {
        const [, row, column] = selector.match(/data-row="(\d+)"\]\[data-column="(\d+)"/);
        return this.children.find(child => child.dataset.row == row && child.dataset.column == column);
      },
      querySelectorAll() { return []; },
    };
  }
  const context = vm.createContext({
    document: {
      getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
      createElement: element, querySelectorAll: () => [], addEventListener() {},
    },
    window: { matchMedia: () => ({ matches: false }) },
    localStorage: {
      getItem(key) { if (storageError) throw Error('Storage blocked'); return storage.get(key) || null; },
      setItem(key, value) { if (storageError) throw Error('Storage blocked'); storage.set(key, value); },
    },
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  const run = source => vm.runInContext(source, context);
  run('Math.random = () => 0');
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) run(match[1]);
  return {
    run, elements, storage,
    grid: () => JSON.parse(run('JSON.stringify(game2048.grid)')),
    advance(ms) {
      const until = now + ms;
      while (true) {
        const next = [...timers.entries()].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at; timers.delete(next[0]); next[1].callback();
      }
      now = until;
    },
  };
}

test('2048 application only spawns after valid moves and preserves the best score on restart', () => {
  const app = application();
  app.run("move2048('left')"); app.advance(150);
  assert.deepEqual(app.grid()[0], [4, 2, 0, 0]);
  assert.equal(app.run('game2048.score'), 4);
  const before = app.grid();
  app.run("move2048('up')"); app.advance(150);
  assert.deepEqual(app.grid(), before);
  assert.equal(app.storage.get('quark-2048-best'), '4');
  app.run('reset2048()');
  assert.equal(app.run('game2048.score'), 0);
  assert.equal(app.run('game2048.best'), 4);
  assert.equal(app.grid().flat().filter(Boolean).length, 2);
});

test('2048 victory pauses play, allows continuing, and does not repeat the victory dialog', () => {
  const app = application();
  app.run('game2048.grid = [[1024,1024,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]; render2048(); move2048("left")');
  app.advance(150);
  assert.equal(app.elements.get('overlay2048').hidden, false);
  assert.equal(app.elements.get('continue2048').hidden, false);
  const won = app.grid();
  app.run('move2048("down")'); app.advance(200);
  assert.deepEqual(app.grid(), won);
  app.elements.get('continue2048').handlers.click();
  app.run('move2048("down")'); app.advance(150);
  assert.equal(app.elements.get('overlay2048').hidden, true);
  assert.equal(app.grid()[3][0], 2048);
});

test('2048 reset cancels both an in-flight slide and an older queued direction', () => {
  const app = application();
  app.run('move2048("left"); move2048("down")'); app.advance(150);
  app.run('move2048("right"); reset2048()');
  const fresh = app.grid(); app.advance(600);
  assert.deepEqual(app.grid(), fresh);
  assert.equal(app.run('game2048.score'), 0);
});

test('2048 stays playable when the browser denies local storage', () => {
  const app = application({ storageError: true });
  app.run('move2048("left")'); app.advance(150);
  assert.equal(app.run('game2048.score'), 4);
  assert.equal(app.run('game2048.best'), 4);
});

test('2048 only completes the active finger swipe and reset discards it', () => {
  const app = application(), board = app.elements.get('board2048');
  const primary = { isPrimary: true, button: 0, pointerId: 1, clientX: 200, clientY: 100 };
  board.handlers.pointerdown(primary);
  board.handlers.pointerup({ pointerId: 2, clientX: 100, clientY: 100 });
  board.handlers.pointercancel({ pointerId: 2 });
  app.advance(200);
  assert.equal(app.run('game2048.score'), 0);
  board.handlers.pointerup({ ...primary, clientX: 100 });
  app.advance(200);
  assert.equal(app.run('game2048.score'), 4);
  board.handlers.pointerdown(primary);
  app.run('reset2048()');
  board.handlers.pointerup({ ...primary, clientX: 100 });
  app.advance(200);
  assert.equal(app.run('game2048.score'), 0);
});
