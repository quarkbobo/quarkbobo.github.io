const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Run the real page script; only canvas, DOM and the timer boundary are stubbed.
function loadGame() {
  const nodes = new Map(), timers = new Map();
  let timerId = 0;
  const element = () => ({
    style: {}, children: [], className: '', textContent: '', disabled: false,
    classList: { add() {}, remove() {} },
    events: {}, addEventListener(type, callback) { this.events[type] = callback; },
    setAttribute() {}, focus() {}, remove() {},
    appendChild(child) { this.children.push(child); },
    insertBefore(child) { this.children.unshift(child); },
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); },
    get firstChild() { return this.children[0] || null; },
    get firstElementChild() { return this.children.find(child => child.style) || null; },
    set innerHTML(value) { this.children = []; this.html = value; },
    get innerHTML() { return this.html || ''; },
    getContext() { return new Proxy({}, { get: () => () => {} }); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 560, height: 560 }; },
    width: 560, height: 560
  });
  for (const id of ['board', 'moveList', 'currentTurn', 'statusText', 'undoBtn', 'drawBtn', 'resignBtn', 'gameOver', 'winnerText', 'gameMode', 'modeHelp']) nodes.set(id, element());
  const context = vm.createContext({
    window: {}, document: { getElementById: id => nodes.get(id) || null, createElement: element, body: element() },
    Image: class { complete = false; }, console, performance,
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id)
  });
  const html = fs.readFileSync(path.join(__dirname, '../source/国际象棋/index.html'), 'utf8');
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1] + '\nthis.ChessGame = ChessGame; this.Piece = Piece;', context);
  const game = new context.ChessGame();
  return { game, nodes, timers, Piece: context.Piece, tick() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(callback => callback()); } };
}

function position(env, entries, turn = 'white') {
  const { game, Piece } = env;
  game.pieces = entries.map(([type, x, y, color, moved = true]) => Object.assign(new Piece(type, x, y, color), { hasMoved: moved }));
  game.currentTurn = turn;
  game.enPassantTarget = null;
  game.updateBoard();
  game.positionHistory = [game.getPositionKey()];
}
const move = (game, fx, fy, tx, ty, promotion = null) => game.movePiece(game.board[fy][fx], tx, ty, promotion);

test('default game replies as black, locks human input, and undo restores the entire turn', () => {
  const env = loadGame(), { game } = env;
  assert.equal(game.mode, 'ai');
  const initial = game.getPositionKey();
  // The real HTML begins with whitespace text before its placeholder element.
  env.nodes.get('moveList').children.push({ nodeType: 3, textContent: '\n' });
  move(game, 4, 6, 4, 4);
  assert.equal(game.aiThinking, true);
  game.handleClick({ clientX: 40 + 4 * 60 + 30, clientY: 40 + 1 * 60 + 30 });
  assert.equal(game.selectedPiece, null);
  env.tick();
  assert.equal(game.moveCount, 2);
  assert.equal(game.currentTurn, 'white');
  assert.equal(game.aiThinking, false);
  game.undo();
  assert.equal(game.moveCount, 0);
  assert.equal(game.getPositionKey(), initial);
  assert.equal(game.positionHistory.length, 1);
});

test('restart and undo invalidate even already-delivered AI callbacks', () => {
  for (const action of ['restart', 'undo']) {
    const { game, timers } = loadGame();
    move(game, 4, 6, 4, 4);
    const callback = [...timers.values()].at(-1);
    assert.equal(typeof callback, 'function');
    game[action]();
    callback();
    assert.equal(game.moveCount, 0);
    assert.equal(game.currentTurn, 'white');
    assert.equal(game.aiThinking, false);
  }
});

test('local mode never queues a computer move and undoes one ply', () => {
  const env = loadGame(), { game } = env;
  game.setMode('local');
  move(game, 4, 6, 4, 4);
  env.tick();
  assert.equal(game.moveCount, 1);
  move(game, 4, 1, 4, 3);
  game.undo();
  assert.equal(game.moveCount, 1);
  assert.equal(game.currentTurn, 'black');
});

test('opening legal moves match standard perft counts and search leaves position intact', () => {
  const { game } = loadGame();
  const before = JSON.stringify(game.pieces);
  const moves = game.getLegalMoves('white');
  assert.equal(moves.length, 20);
  let replies = 0;
  for (const candidate of moves) {
    const state = game.snapshot();
    game.applyMove(candidate.piece, candidate.x, candidate.y, candidate.promotion);
    replies += game.getLegalMoves('black').length;
    game.restore(state);
  }
  assert.equal(replies, 400);
  const best = game.chooseAIMove();
  assert.ok(best && game.isValidMove(best.piece, best.x, best.y));
  assert.equal(JSON.stringify(game.pieces), before);
});

test('pinned pieces cannot expose their king and kings cannot be captured', () => {
  const env = loadGame(), { game } = env;
  position(env, [['king', 4, 7, 'white'], ['rook', 4, 6, 'white'], ['rook', 4, 0, 'black'], ['king', 0, 0, 'black']]);
  assert.equal(game.isValidMove(game.board[6][4], 3, 6), false);
  assert.equal(game.isValidMove(game.board[6][4], 4, 0), true);
  position(env, [['king', 7, 7, 'white'], ['rook', 0, 7, 'white'], ['king', 0, 0, 'black']]);
  assert.equal(game.isValidMove(game.board[7][0], 0, 0), false);
});

test('castling requires a same-color unmoved rook on its home square and a safe path', () => {
  const env = loadGame(), { game } = env;
  position(env, [['king', 4, 7, 'white', false], ['rook', 7, 7, 'white', false], ['king', 0, 0, 'black']]);
  assert.equal(game.isValidMove(game.board[7][4], 6, 7), true);
  game.board[7][7].color = 'black';
  assert.equal(game.isValidMove(game.board[7][4], 6, 7), false);
  position(env, [['king', 4, 7, 'white', false], ['rook', 7, 7, 'white', false], ['king', 0, 0, 'black'], ['rook', 5, 0, 'black']]);
  assert.equal(game.isValidMove(game.board[7][4], 6, 7), false);
});

test('en passant removes the pawn, expires after one move, and cannot expose check', () => {
  const env = loadGame(), { game } = env;
  game.setMode('local');
  position(env, [['king', 7, 7, 'white'], ['king', 0, 0, 'black'], ['pawn', 4, 3, 'white'], ['pawn', 3, 1, 'black']], 'black');
  move(game, 3, 1, 3, 3);
  assert.equal(game.isValidMove(game.board[3][4], 3, 2), true);
  move(game, 4, 3, 3, 2);
  assert.equal(game.board[3][3], null);
  game.undo();
  assert.equal(game.board[3][3].type, 'pawn');
  assert.equal(game.isValidMove(game.board[3][4], 3, 2), true);
  move(game, 7, 7, 6, 7);
  assert.equal(game.enPassantTarget, null);
  position(env, [['king', 7, 3, 'white'], ['king', 0, 0, 'black'], ['pawn', 6, 3, 'white'], ['pawn', 5, 3, 'black'], ['rook', 0, 3, 'black']]);
  game.enPassantTarget = { x: 5, y: 2 };
  assert.equal(game.isValidMove(game.board[3][6], 5, 2), false);
});

test('promotion changes the piece, notation stays pawn notation, and undo restores it', () => {
  const env = loadGame(), { game, nodes } = env;
  game.setMode('local');
  position(env, [['king', 7, 7, 'white'], ['king', 7, 0, 'black'], ['pawn', 0, 1, 'white']]);
  move(game, 0, 1, 0, 0, 'knight');
  assert.equal(game.board[0][0].type, 'knight');
  assert.match(nodes.get('moveList').children.find(child => child.className.includes('move-item')).innerHTML, />a8=N</);
  game.undo();
  assert.equal(game.board[1][0].type, 'pawn');
});

test('mate finishes after drawing the final move and can be undone', () => {
  const env = loadGame(), { game, nodes } = env;
  game.setMode('local');
  move(game, 5, 6, 5, 5); move(game, 4, 1, 4, 3);
  move(game, 6, 6, 6, 4); move(game, 3, 0, 7, 4);
  assert.equal(game.gameOver, true);
  assert.equal(game.currentTurn, 'white');
  assert.equal(game.selectedPiece, null);
  assert.match(nodes.get('winnerText').textContent, /黑方获胜/);
  assert.equal(nodes.get('undoBtn').disabled, false);
  game.undo();
  assert.equal(game.gameOver, false);
  assert.equal(game.moveCount, 3);
  assert.equal(game.board[0][3].type, 'queen');
});

test('stalemate ends in a draw and AI selects a forced mate when available', () => {
  const env = loadGame(), { game, nodes } = env;
  game.setMode('local');
  position(env, [['king', 0, 0, 'black'], ['king', 2, 2, 'white'], ['queen', 1, 3, 'white']]);
  move(game, 1, 3, 1, 2);
  assert.equal(game.gameOver, true);
  assert.match(nodes.get('winnerText').textContent, /逼和/);
  game.restart();
  position(env, [['king', 0, 0, 'black'], ['king', 2, 2, 'white'], ['queen', 2, 1, 'white']]);
  const best = game.chooseAIMove();
  assert.ok(best);
  game.applyMove(best.piece, best.x, best.y, best.promotion);
  assert.equal(game.isInCheck('black'), true);
  assert.equal(game.hasValidMoves('black'), false);
});

test('position keys distinguish king and knight and ignore unusable en passant targets', () => {
  const env = loadGame(), { game } = env;
  const original = game.getPositionKey();
  [game.board[7][4].type, game.board[7][1].type] = ['knight', 'king'];
  assert.notEqual(game.getPositionKey(), original);
  game.restart();
  game.enPassantTarget = { x: 4, y: 2 };
  assert.equal(game.getPositionKey(), original);
  position(env, [['king', 7, 3, 'white'], ['king', 0, 0, 'black'], ['pawn', 6, 3, 'white'], ['pawn', 5, 3, 'black'], ['rook', 0, 3, 'black']]);
  const noEP = game.getPositionKey();
  game.enPassantTarget = { x: 5, y: 2 };
  assert.equal(game.getPositionKey(), noEP);
});

test('resigning while black thinks is a white resignation and cancels the reply', () => {
  const env = loadGame(), { game, nodes } = env;
  move(game, 4, 6, 4, 4);
  game.resign();
  env.tick();
  assert.equal(game.moveCount, 1);
  assert.equal(game.gameOver, true);
  assert.match(nodes.get('winnerText').textContent, /黑方获胜/);
});

test('keyboard moves preserve the computer-thinking announcement', () => {
  const { game, nodes } = loadGame();
  const key = key => nodes.get('board').events.keydown({ key, preventDefault() {} });
  key('Enter'); key('ArrowUp'); key('ArrowUp'); key('Enter');
  assert.equal(game.moveCount, 1);
  assert.equal(game.board[4][4].type, 'pawn');
  assert.equal(game.aiThinking, true);
  assert.match(nodes.get('statusText').textContent, /电脑思考/);
});

test('castling and undo preserve the rook and king rights exactly', () => {
  const env = loadGame(), { game } = env;
  game.setMode('local');
  position(env, [['king', 4, 7, 'white', false], ['rook', 7, 7, 'white', false], ['king', 0, 0, 'black']]);
  const original = game.getPositionKey();
  move(game, 4, 7, 6, 7);
  assert.equal(game.board[7][5].type, 'rook');
  assert.equal(game.board[7][6].hasMoved, true);
  game.undo();
  assert.equal(game.getPositionKey(), original);
  assert.equal(game.board[7][7].hasMoved, false);
});

test('threefold repetition stops play and undo restores a live second repetition', () => {
  const { game, nodes } = loadGame();
  game.setMode('local');
  for (let cycle = 0; cycle < 2; cycle++) {
    move(game, 6, 7, 5, 5); move(game, 6, 0, 5, 2);
    move(game, 5, 5, 6, 7); move(game, 5, 2, 6, 0);
  }
  assert.equal(game.gameOver, true);
  assert.match(nodes.get('winnerText').textContent, /三次重复/);
  game.undo();
  assert.equal(game.gameOver, false);
  assert.equal(game.moveCount, 7);
});

test('black AI promotes without opening a human choice dialog', () => {
  const env = loadGame(), { game } = env;
  position(env, [['king', 7, 0, 'black'], ['king', 5, 2, 'white'], ['pawn', 0, 6, 'black']], 'black');
  game.queueAIMove();
  env.tick();
  assert.equal(game.board[7][0].type, 'queen');
  assert.equal(game.promotionPending, null);
  assert.equal(game.currentTurn, 'white');
});

test('changing mode cancels pending AI work and resets the board', () => {
  const { game, timers } = loadGame();
  move(game, 4, 6, 4, 4);
  const callback = [...timers.values()].at(-1);
  game.setMode('local');
  callback();
  assert.equal(game.moveCount, 0);
  assert.equal(game.currentTurn, 'white');
  assert.equal(game.mode, 'local');
});

test('capturing the last opposing minor piece recognizes dead material', () => {
  const env = loadGame(), { game, nodes } = env;
  game.setMode('local');
  position(env, [['king', 0, 7, 'white'], ['bishop', 1, 6, 'white'], ['king', 7, 0, 'black'], ['bishop', 2, 5, 'black']]);
  move(game, 1, 6, 2, 5);
  assert.equal(game.gameOver, true);
  assert.match(nodes.get('winnerText').textContent, /子力不足/);
  game.undo();
  assert.equal(game.gameOver, false);
  assert.equal(game.board[5][2].color, 'black');
});

test('dead material does not confuse two knights or opposite-color bishops with a forced draw', () => {
  const env = loadGame(), { game } = env;
  for (const [minors, dead] of [
    [[], true],
    [[['knight', 1, 6, 'white']], true],
    [[['bishop', 1, 6, 'white'], ['bishop', 2, 5, 'black']], true],
    [[['knight', 1, 6, 'white'], ['knight', 2, 6, 'white']], false],
    [[['bishop', 1, 6, 'white'], ['bishop', 2, 4, 'black']], false]
  ]) {
    position(env, [['king', 0, 7, 'white'], ['king', 7, 0, 'black'], ...minors]);
    assert.equal(game.hasInsufficientMaterial(), dead);
  }
});
