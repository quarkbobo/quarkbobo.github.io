const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  return next();
});

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const BOARD_ROWS = 10;
const BOARD_COLS = 9;
const TURN_TIME_SECONDS = 30 * 60;
const SIDES = { red: "red", black: "black" };
const PIECES = { KING: "king", ADVISOR: "advisor", ELEPHANT: "elephant", HORSE: "horse", ROOK: "rook", CANNON: "cannon", PAWN: "pawn" };
const rooms = new Map();
const socketRoom = new Map();

function makePiece(type, side) { return { type, side }; }
function cloneBoard(board) { return board.map((row) => row.map((p) => (p ? { ...p } : null))); }
function createInitialBoard() {
  const board = Array.from({ length: BOARD_ROWS }, () => Array(BOARD_COLS).fill(null));
  board[0][0] = makePiece(PIECES.ROOK, SIDES.black); board[0][1] = makePiece(PIECES.HORSE, SIDES.black); board[0][2] = makePiece(PIECES.ELEPHANT, SIDES.black); board[0][3] = makePiece(PIECES.ADVISOR, SIDES.black); board[0][4] = makePiece(PIECES.KING, SIDES.black); board[0][5] = makePiece(PIECES.ADVISOR, SIDES.black); board[0][6] = makePiece(PIECES.ELEPHANT, SIDES.black); board[0][7] = makePiece(PIECES.HORSE, SIDES.black); board[0][8] = makePiece(PIECES.ROOK, SIDES.black);
  board[2][1] = makePiece(PIECES.CANNON, SIDES.black); board[2][7] = makePiece(PIECES.CANNON, SIDES.black);
  board[3][0] = makePiece(PIECES.PAWN, SIDES.black); board[3][2] = makePiece(PIECES.PAWN, SIDES.black); board[3][4] = makePiece(PIECES.PAWN, SIDES.black); board[3][6] = makePiece(PIECES.PAWN, SIDES.black); board[3][8] = makePiece(PIECES.PAWN, SIDES.black);
  board[9][0] = makePiece(PIECES.ROOK, SIDES.red); board[9][1] = makePiece(PIECES.HORSE, SIDES.red); board[9][2] = makePiece(PIECES.ELEPHANT, SIDES.red); board[9][3] = makePiece(PIECES.ADVISOR, SIDES.red); board[9][4] = makePiece(PIECES.KING, SIDES.red); board[9][5] = makePiece(PIECES.ADVISOR, SIDES.red); board[9][6] = makePiece(PIECES.ELEPHANT, SIDES.red); board[9][7] = makePiece(PIECES.HORSE, SIDES.red); board[9][8] = makePiece(PIECES.ROOK, SIDES.red);
  board[7][1] = makePiece(PIECES.CANNON, SIDES.red); board[7][7] = makePiece(PIECES.CANNON, SIDES.red);
  board[6][0] = makePiece(PIECES.PAWN, SIDES.red); board[6][2] = makePiece(PIECES.PAWN, SIDES.red); board[6][4] = makePiece(PIECES.PAWN, SIDES.red); board[6][6] = makePiece(PIECES.PAWN, SIDES.red); board[6][8] = makePiece(PIECES.PAWN, SIDES.red);
  return board;
}
function inBounds(row, col) { return row >= 0 && row < BOARD_ROWS && col >= 0 && col < BOARD_COLS; }
function inPalace(row, col, side) { if (col < 3 || col > 5) return false; return side === SIDES.black ? row <= 2 : row >= 7; }
function crossedRiver(row, side) { return side === SIDES.red ? row <= 4 : row >= 5; }
function clearPathStraight(board, from, to) {
  if (from.row === to.row) { const step = to.col > from.col ? 1 : -1; for (let c = from.col + step; c !== to.col; c += step) if (board[from.row][c]) return false; return true; }
  if (from.col === to.col) { const step = to.row > from.row ? 1 : -1; for (let r = from.row + step; r !== to.row; r += step) if (board[r][from.col]) return false; return true; }
  return false;
}
function countInterveningPieces(board, from, to) {
  let count = 0;
  if (from.row === to.row) { const step = to.col > from.col ? 1 : -1; for (let c = from.col + step; c !== to.col; c += step) if (board[from.row][c]) count += 1; }
  else if (from.col === to.col) { const step = to.row > from.row ? 1 : -1; for (let r = from.row + step; r !== to.row; r += step) if (board[r][from.col]) count += 1; }
  return count;
}
function findKings(board) {
  let red = null; let black = null;
  for (let r = 0; r < BOARD_ROWS; r += 1) for (let c = 0; c < BOARD_COLS; c += 1) { const p = board[r][c]; if (p?.type === PIECES.KING) { if (p.side === SIDES.red) red = { row: r, col: c }; else black = { row: r, col: c }; } }
  return { red, black };
}
function kingsFacing(board) {
  const { red, black } = findKings(board);
  if (!red || !black || red.col !== black.col) return false;
  const step = red.row > black.row ? 1 : -1;
  for (let r = black.row + step; r !== red.row; r += step) if (board[r][red.col]) return false;
  return true;
}
function isPseudoLegalMove(board, from, to, side) {
  if (!inBounds(from.row, from.col) || !inBounds(to.row, to.col)) return false;
  const piece = board[from.row][from.col]; if (!piece || piece.side !== side) return false;
  const target = board[to.row][to.col]; if (target && target.side === side) return false;
  const dRow = to.row - from.row; const dCol = to.col - from.col; const absRow = Math.abs(dRow); const absCol = Math.abs(dCol);
  switch (piece.type) {
    case PIECES.KING: return inPalace(to.row, to.col, side) && absRow + absCol === 1;
    case PIECES.ADVISOR: return inPalace(to.row, to.col, side) && absRow === 1 && absCol === 1;
    case PIECES.ELEPHANT: if (absRow !== 2 || absCol !== 2) return false; if (side === SIDES.red && to.row < 5) return false; if (side === SIDES.black && to.row > 4) return false; return !board[from.row + dRow / 2][from.col + dCol / 2];
    case PIECES.HORSE: if (!((absRow === 2 && absCol === 1) || (absRow === 1 && absCol === 2))) return false; return absRow === 2 ? !board[from.row + dRow / 2][from.col] : !board[from.row][from.col + dCol / 2];
    case PIECES.ROOK: return clearPathStraight(board, from, to);
    case PIECES.CANNON: if (!(from.row === to.row || from.col === to.col)) return false; return target ? countInterveningPieces(board, from, to) === 1 : countInterveningPieces(board, from, to) === 0;
    case PIECES.PAWN: if (side === SIDES.red) { if (dRow === -1 && dCol === 0) return true; return crossedRiver(from.row, side) && dRow === 0 && absCol === 1; } if (dRow === 1 && dCol === 0) return true; return crossedRiver(from.row, side) && dRow === 0 && absCol === 1;
    default: return false;
  }
}
function applyMove(board, from, to) { const next = cloneBoard(board); next[to.row][to.col] = next[from.row][from.col]; next[from.row][from.col] = null; return next; }
function isInCheck(board, side) {
  const kings = findKings(board); const kingPos = side === SIDES.red ? kings.red : kings.black; if (!kingPos) return true;
  const enemy = side === SIDES.red ? SIDES.black : SIDES.red;
  for (let r = 0; r < BOARD_ROWS; r += 1) for (let c = 0; c < BOARD_COLS; c += 1) { const p = board[r][c]; if (!p || p.side !== enemy) continue; if (isPseudoLegalMove(board, { row: r, col: c }, kingPos, enemy)) return true; }
  return kingsFacing(board);
}
function hasAnyLegalMove(board, side) {
  for (let r = 0; r < BOARD_ROWS; r += 1) for (let c = 0; c < BOARD_COLS; c += 1) {
    const p = board[r][c]; if (!p || p.side !== side) continue;
    for (let tr = 0; tr < BOARD_ROWS; tr += 1) for (let tc = 0; tc < BOARD_COLS; tc += 1) {
      if (!isPseudoLegalMove(board, { row: r, col: c }, { row: tr, col: tc }, side)) continue;
      const next = applyMove(board, { row: r, col: c }, { row: tr, col: tc });
      if (!kingsFacing(next) && !isInCheck(next, side)) return true;
    }
  }
  return false;
}
function createRoom(roomId) {
  return { roomId, board: createInitialBoard(), turn: SIDES.red, winner: null, message: "红方先手", players: { red: null, black: null }, watchers: new Set(), history: [], undoRequestBy: null, timeLeft: { red: TURN_TIME_SECONDS, black: TURN_TIME_SECONDS }, lastTickMs: Date.now() };
}
function snapshot(room) { return { roomId: room.roomId, board: room.board, turn: room.turn, winner: room.winner, message: room.message, players: room.players, watchers: room.watchers.size, undoRequestBy: room.undoRequestBy, timeLeft: room.timeLeft }; }
function randomRoomId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let out = "";
  for (let i = 0; i < 6; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
function updateClock(room) {
  if (room.winner) return;
  const now = Date.now(); const elapsed = Math.floor((now - room.lastTickMs) / 1000); if (elapsed <= 0) return;
  room.lastTickMs = now; room.timeLeft[room.turn] = Math.max(0, room.timeLeft[room.turn] - elapsed);
  if (room.timeLeft[room.turn] === 0) { room.winner = room.turn === SIDES.red ? SIDES.black : SIDES.red; room.message = `${room.turn === SIDES.red ? "红方" : "黑方"}超时，${room.winner === SIDES.red ? "红方" : "黑方"}获胜`; }
}
function broadcastRoom(roomId) { const room = rooms.get(roomId); if (room) io.to(roomId).emit("room:update", snapshot(room)); }
function joinRole(room, socket, preferredRole) {
  let role = "watcher";
  if (preferredRole === SIDES.red || preferredRole === SIDES.black) {
    if (!room.players[preferredRole] || room.players[preferredRole] === socket.id) { room.players[preferredRole] = socket.id; role = preferredRole; } else room.watchers.add(socket.id);
  } else if (!room.players.red) { room.players.red = socket.id; role = SIDES.red; }
  else if (!room.players.black) { room.players.black = socket.id; role = SIDES.black; }
  else room.watchers.add(socket.id);
  return role;
}

io.on("connection", (socket) => {
  socket.on("room:create", ({ role } = {}) => {
    let roomId = randomRoomId(); while (rooms.has(roomId)) roomId = randomRoomId();
    const room = createRoom(roomId); rooms.set(roomId, room); socket.join(roomId); socketRoom.set(socket.id, roomId);
    socket.emit("room:joined", { roomId, role: joinRole(room, socket, role || SIDES.red) }); broadcastRoom(roomId);
  });
  socket.on("room:join", ({ roomId, role } = {}) => {
    const id = String(roomId || "").toUpperCase().trim(); const room = rooms.get(id);
    if (!room) return socket.emit("room:error", { message: "房间不存在。" });
    socket.join(id); socketRoom.set(socket.id, id); socket.emit("room:joined", { roomId: id, role: joinRole(room, socket, role) }); broadcastRoom(id);
  });
  socket.on("game:move", ({ from, to } = {}) => {
    const roomId = socketRoom.get(socket.id); const room = rooms.get(roomId); if (!room) return;
    updateClock(room); if (room.winner) return broadcastRoom(roomId);
    if (room.players[room.turn] !== socket.id) return socket.emit("room:error", { message: "还没轮到你走子。" });
    if (!from || !to) return socket.emit("room:error", { message: "缺少走子参数。" });
    if (!isPseudoLegalMove(room.board, from, to, room.turn)) return socket.emit("room:error", { message: "非法走子。" });
    const movedBoard = applyMove(room.board, from, to);
    if (kingsFacing(movedBoard) || isInCheck(movedBoard, room.turn)) return socket.emit("room:error", { message: "非法走子：己方将帅受将。" });
    room.history.push({ board: cloneBoard(room.board), turn: room.turn, timeLeft: { ...room.timeLeft }, message: room.message, winner: room.winner });
    room.undoRequestBy = null; room.board = movedBoard; const nextTurn = room.turn === SIDES.red ? SIDES.black : SIDES.red; room.turn = nextTurn; room.lastTickMs = Date.now();
    const nextNoMove = !hasAnyLegalMove(room.board, nextTurn); const nextInCheck = isInCheck(room.board, nextTurn);
    if (nextNoMove) { room.winner = nextTurn === SIDES.red ? SIDES.black : SIDES.red; room.message = nextInCheck ? `绝杀！${room.winner === SIDES.red ? "红方" : "黑方"}获胜` : `困毙！${room.winner === SIDES.red ? "红方" : "黑方"}获胜`; }
    else room.message = nextInCheck ? `将军！轮到${nextTurn === SIDES.red ? "红方" : "黑方"}` : `轮到${nextTurn === SIDES.red ? "红方" : "黑方"}`;
    broadcastRoom(roomId);
  });
  socket.on("game:reset", () => {
    const roomId = socketRoom.get(socket.id); const room = rooms.get(roomId); if (!room) return;
    if (room.players.red !== socket.id && room.players.black !== socket.id) return socket.emit("room:error", { message: "仅对局双方可重开。" });
    room.board = createInitialBoard(); room.turn = SIDES.red; room.winner = null; room.message = "已重开，红方先手"; room.history = []; room.undoRequestBy = null; room.timeLeft = { red: TURN_TIME_SECONDS, black: TURN_TIME_SECONDS }; room.lastTickMs = Date.now(); broadcastRoom(roomId);
  });
  socket.on("game:undo:request", () => {
    const roomId = socketRoom.get(socket.id); const room = rooms.get(roomId); if (!room || room.history.length === 0 || room.winner) return;
    const role = room.players.red === socket.id ? SIDES.red : room.players.black === socket.id ? SIDES.black : null;
    if (!role) return socket.emit("room:error", { message: "仅对局双方可悔棋。" });
    room.undoRequestBy = role; room.message = `${role === SIDES.red ? "红方" : "黑方"}请求悔棋`; broadcastRoom(roomId);
  });
  socket.on("game:undo:respond", ({ accept } = {}) => {
    const roomId = socketRoom.get(socket.id); const room = rooms.get(roomId); if (!room || !room.undoRequestBy) return;
    const role = room.players.red === socket.id ? SIDES.red : room.players.black === socket.id ? SIDES.black : null;
    if (!role || role === room.undoRequestBy) return;
    if (!accept) { room.message = "悔棋请求被拒绝"; room.undoRequestBy = null; return broadcastRoom(roomId); }
    const previous = room.history.pop(); if (!previous) return;
    room.board = previous.board; room.turn = previous.turn; room.timeLeft = previous.timeLeft; room.message = "悔棋成功"; room.winner = previous.winner; room.undoRequestBy = null; room.lastTickMs = Date.now(); broadcastRoom(roomId);
  });
  socket.on("disconnect", () => {
    const roomId = socketRoom.get(socket.id); socketRoom.delete(socket.id); if (!roomId) return;
    const room = rooms.get(roomId); if (!room) return;
    if (room.players.red === socket.id) room.players.red = null; if (room.players.black === socket.id) room.players.black = null; room.watchers.delete(socket.id);
    if (!room.players.red && !room.players.black && room.watchers.size === 0) return rooms.delete(roomId);
    broadcastRoom(roomId);
  });
});

setInterval(() => {
  for (const [roomId, room] of rooms.entries()) {
    const old = `${room.winner}-${room.timeLeft.red}-${room.timeLeft.black}`;
    updateClock(room);
    if (old !== `${room.winner}-${room.timeLeft.red}-${room.timeLeft.black}`) broadcastRoom(roomId);
  }
}, 1000);

app.get("/api/health", (req, res) => res.json({ ok: true, rooms: rooms.size }));
server.listen(port, () => console.log(`Xiangqi realtime server running on :${port}`));
