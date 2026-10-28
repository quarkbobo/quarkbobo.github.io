const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../source/中国象棋/index.html'), 'utf8');

function loadGame() {
  const elements = new Map();
  const timers = new Map();
  let timerId = 0;
  function element() {
    const classes = new Set();
    return {
      style: {}, children: [], value: 'ai', width: 560, height: 620, disabled: true,
      classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) },
      addEventListener() {}, setAttribute() {},
      get firstChild() { return this.children[0]; },
      set innerHTML(value) { this.markup = value; this.children = []; },
      get innerHTML() { return this.markup || ''; },
      insertBefore(child) { this.children.unshift(child); },
      removeChild(child) { this.children.splice(this.children.indexOf(child), 1); },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 560, height: 620 }),
      getContext: () => new Proxy({}, { get: (_, name) => name === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {} })
    };
  }
  for (const id of ['board', 'currentTurn', 'statusText', 'moveList', 'gameOver', 'winnerText', 'undoBtn', 'gameMode']) elements.set(id, element());
  const context = vm.createContext({
    document: { getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }, createElement: element },
    window: {}, performance, console,
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); }
  });
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  const game = vm.runInContext('new XiangqiGame()', context);
  return { game, elements, timers, flush() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(callback => callback()); } };
}

function position(game, pieces, turn = 'red') {
  game.pieces = pieces.map(([type, x, y, side]) => ({ type, x, y, side, captured: false }));
  game.currentTurn = turn;
  game.updateBoard();
  return game.pieces;
}

test('human red starts at the bottom and a move receives one legal computer reply', () => {
  const { game, flush, timers } = loadGame();
  const pawn = game.board[6][0];
  assert.equal(pawn.side, 'red');
  assert.equal(game.isValidMove(pawn, 0, 5), true);
  game.movePiece(pawn, 0, 5);
  assert.equal(game.currentTurn, 'black');
  assert.equal(timers.size, 1);
  const before = JSON.stringify(game.pieces);
  const candidate = game.chooseAiMove();
  assert.equal(game.isValidMove(candidate.piece, candidate.x, candidate.y), true);
  assert.equal(JSON.stringify(game.pieces), before, 'search must restore all pieces');
  flush();
  assert.equal(game.moveHistory.length, 2);
  assert.equal(game.currentTurn, 'red');
  assert.equal(game.isInCheck('black'), false);
  assert.equal(timers.size, 0);
});

test('moving a blocker cannot expose either general to a rook or the flying general', () => {
  const { game } = loadGame();
  let pieces = position(game, [['帅', 4, 9, 'red'], ['将', 4, 0, 'black'], ['车', 4, 5, 'red']]);
  assert.equal(game.isValidMove(pieces[2], 3, 5), false);
  assert.equal(game.isValidMove(pieces[2], 4, 4), true);
  pieces = position(game, [['帅', 4, 9, 'red'], ['将', 3, 0, 'black'], ['车', 4, 0, 'black'], ['车', 4, 5, 'red']]);
  assert.equal(game.isValidMove(pieces[3], 3, 5), false);
  assert.equal(game.isValidMove(pieces[3], 4, 0), true);
});

test('horse legs, elephant eyes and river, palace, cannon screens, and pawn direction apply', () => {
  const { game } = loadGame();
  const base = [['帅', 4, 9, 'red'], ['将', 3, 0, 'black']];
  let pieces = position(game, [...base, ['马', 1, 9, 'red'], ['兵', 1, 8, 'red']]);
  assert.equal(game.isValidMove(pieces[2], 2, 7), false);
  assert.equal(game.isValidMove(pieces[2], 3, 8), true);
  pieces = position(game, [...base, ['相', 2, 9, 'red'], ['兵', 3, 8, 'red']]);
  assert.equal(game.isValidMove(pieces[2], 4, 7), false);
  assert.equal(game.isValidMove(pieces[2], 0, 7), true);
  pieces[2].y = 5; game.updateBoard();
  assert.equal(game.isValidMove(pieces[2], 0, 3), false);
  assert.equal(game.isValidMove(pieces[0], 4, 8), true);
  assert.equal(game.isValidMove(pieces[0], 4, 6), false);
  pieces = position(game, [...base, ['炮', 0, 7, 'red'], ['卒', 0, 2, 'black'], ['兵', 0, 5, 'red']]);
  assert.equal(game.isValidMove(pieces[2], 0, 2), true);
  assert.equal(game.isValidMove(pieces[2], 0, 4), false);
  pieces[4].captured = true; game.updateBoard();
  assert.equal(game.isValidMove(pieces[2], 0, 2), false);
  pieces = position(game, [...base, ['兵', 0, 6, 'red'], ['卒', 8, 3, 'black']]);
  assert.equal(game.isValidMove(pieces[2], 0, 5), true);
  assert.equal(game.isValidMove(pieces[2], 1, 6), false);
  assert.equal(game.isValidMove(pieces[3], 8, 4), true);
  assert.equal(game.isValidMove(pieces[3], 8, 2), false);
  pieces[2].y = 4; game.updateBoard();
  assert.equal(game.isValidMove(pieces[2], 1, 4), true);
  assert.equal(game.isValidMove(pieces[2], 0, 5), false);
});

test('both checkmate and stalemate end with a loss, and the final move is undoable', () => {
  for (const mate of [false, true]) {
    const { game, elements } = loadGame();
    game.mode = 'local';
    const pieces = position(game, [['帅', 4, 9, 'red'], ['将', 4, 0, 'black'], ['车', 3, 2, 'red'], ['车', 5, 2, 'red'], ['兵', 4, 5, 'red'], ['车', 0, 3, 'red']]);
    game.movePiece(pieces[5], mate ? 4 : 0, mate ? 3 : 1);
    assert.equal(game.gameOver, true);
    assert.equal(game.isInCheck('black'), mate);
    assert.match(elements.get('winnerText').textContent, /红方/);
    assert.equal(elements.get('undoBtn').disabled, false);
    game.undo();
    assert.equal(game.gameOver, false);
    assert.equal(game.moveHistory.length, 0);
    assert.equal(pieces[5].y, 3);
    assert.equal(elements.get('gameOver').classList.contains('show'), false);
  }
});

test('undo restores a complete human/computer turn and cancels pending replies', () => {
  const { game, flush, timers } = loadGame();
  const initial = JSON.stringify(game.pieces);
  game.movePiece(game.board[6][0], 0, 5);
  assert.equal(timers.size, 1);
  game.undo(); flush();
  assert.equal(JSON.stringify(game.pieces), initial);
  assert.equal(game.currentTurn, 'red');
  assert.equal(timers.size, 0);
  game.movePiece(game.board[6][0], 0, 5); flush();
  game.undo();
  assert.equal(JSON.stringify(game.pieces), initial);
  assert.equal(game.moveHistory.length, 0);
  assert.equal(game.currentTurn, 'red');
});

test('restart and local mode cancel old replies without moving new pieces', () => {
  const { game, flush, timers } = loadGame();
  game.movePiece(game.board[6][0], 0, 5);
  game.restart(); flush();
  assert.equal(game.moveHistory.length, 0);
  assert.equal(game.board[6][0].side, 'red');
  game.movePiece(game.board[6][0], 0, 5);
  game.setMode('local'); flush();
  game.movePiece(game.board[6][0], 0, 5);
  assert.equal(timers.size, 0);
  game.movePiece(game.board[3][0], 0, 4);
  assert.equal(game.moveHistory.length, 2);
  game.undo();
  assert.equal(game.moveHistory.length, 1);
  assert.equal(game.currentTurn, 'black');
});

test('move entry rejects the wrong side and invalid coordinates without changing the board', () => {
  const { game } = loadGame();
  const initial = JSON.stringify(game.pieces);
  game.movePiece(game.board[3][0], 0, 4);
  assert.equal(JSON.stringify(game.pieces), initial);
  assert.equal(game.isValidMove(game.board[6][0], 0.5, 5), false);
  assert.equal(game.isValidMove(game.board[6][0], NaN, 5), false);
  assert.equal(game.moveHistory.length, 0);
});

test('capture history keeps the original square and undo restores the captured piece', () => {
  const { game, elements } = loadGame();
  game.mode = 'local';
  const pieces = position(game, [['帅', 4, 9, 'red'], ['将', 3, 0, 'black'], ['车', 0, 6, 'red'], ['卒', 0, 3, 'black']]);
  // Real HTML starts the list with whitespace, so history must not assume a styled firstChild.
  elements.get('moveList').children = [{ nodeType: 3, textContent: '\n    ' }];
  const initial = JSON.stringify(game.pieces);
  assert.equal(game.movePiece(pieces[2], 0, 3), true);
  assert.equal(pieces[3].captured, true);
  assert.match(elements.get('moveList').innerHTML, /九3 → 九6 吃 卒/);
  game.undo();
  assert.equal(JSON.stringify(game.pieces), initial);
  assert.equal(game.board[3][0], pieces[3]);
});

test('scaled canvas clicks move red and ignore input while the computer is thinking', () => {
  const { game, elements } = loadGame();
  elements.get('board').getBoundingClientRect = () => ({ left: 10, top: 20, width: 280, height: 310 });
  const click = (x, y) => game.handleClick({ clientX: 10 + (40 + x * 60) / 2, clientY: 20 + (40 + y * 60) / 2 });
  click(0, 6); click(0, 5);
  assert.equal(game.moveHistory.length, 1);
  assert.equal(game.board[5][0].side, 'red');
  click(0, 3); click(0, 4);
  assert.equal(game.moveHistory.length, 1);
  assert.equal(game.board[3][0].side, 'black');
  assert.equal(game.selectedPiece, null);
});
