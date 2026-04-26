const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const resetBtn = document.getElementById("resetBtn");
const flipBtn = document.getElementById("flipBtn");
const undoBtn = document.getElementById("undoBtn");
const undoAcceptBtn = document.getElementById("undoAcceptBtn");
const undoRejectBtn = document.getElementById("undoRejectBtn");
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const watchRoomBtn = document.getElementById("watchRoomBtn");
const roomIdInput = document.getElementById("roomIdInput");
const roomText = document.getElementById("roomText");
const roleText = document.getElementById("roleText");
const timerText = document.getElementById("timerText");
const serverUrlInput = document.getElementById("serverUrlInput");
const saveServerBtn = document.getElementById("saveServerBtn");

const ASSET_BASE = "https://raw.githubusercontent.com/Ka-hu/chess-pieces/master/xiangqi_wikipedia_intl_modded";
const pieceMap = {
  red: {
    king: `${ASSET_BASE}/red_king.svg`,
    advisor: `${ASSET_BASE}/red_advisor.svg`,
    elephant: `${ASSET_BASE}/red_elephant.svg`,
    horse: `${ASSET_BASE}/red_horse.svg`,
    rook: `${ASSET_BASE}/red_chariot.svg`,
    cannon: `${ASSET_BASE}/red_cannon.svg`,
    pawn: `${ASSET_BASE}/red_pawn.svg`,
  },
  black: {
    king: `${ASSET_BASE}/black_king.svg`,
    advisor: `${ASSET_BASE}/black_advisor.svg`,
    elephant: `${ASSET_BASE}/black_elephant.svg`,
    horse: `${ASSET_BASE}/black_horse.svg`,
    rook: `${ASSET_BASE}/black_chariot.svg`,
    cannon: `${ASSET_BASE}/black_cannon.svg`,
    pawn: `${ASSET_BASE}/black_pawn.svg`,
  },
};

let socket = null;
let game = null;
let selected = null;
let flipped = false;
let myRole = "watcher";
let currentRoomId = "";

function normalizeServerUrl(url) {
  return String(url || "").trim().replace(/\/$/, "");
}

function readQueryServerUrl() {
  const params = new URLSearchParams(window.location.search);
  return normalizeServerUrl(params.get("server"));
}

function readConfigServerUrl() {
  const direct = window.__XIANGQI_SERVER_URL__;
  const fromConfig = window.__XIANGQI_SERVER_CONFIG__?.serverUrl;
  return normalizeServerUrl(direct || fromConfig);
}

function readServerUrl() {
  const queryUrl = readQueryServerUrl();
  if (queryUrl) return queryUrl;

  const configuredUrl = readConfigServerUrl();
  if (configuredUrl) return configuredUrl;

  return normalizeServerUrl(localStorage.getItem("xiangqi_server_url") || "");
}

function writeServerUrl(url) {
  localStorage.setItem("xiangqi_server_url", normalizeServerUrl(url));
}

function connectSocket() {
  const serverUrl = readServerUrl();
  if (!serverUrl) {
    statusEl.textContent = "请先填写后端地址并保存";
    return;
  }
  if (socket) socket.disconnect();
  socket = io(serverUrl, { transports: ["websocket", "polling"] });
  bindSocketEvents();
}

function bindSocketEvents() {
  socket.on("connect", () => {
    statusEl.textContent = "后端连接成功";
  });

  socket.on("room:joined", ({ roomId, role }) => {
    currentRoomId = roomId;
    myRole = role;
    roomIdInput.value = roomId;
    statusEl.textContent = "加入房间成功";
    render();
  });

  socket.on("room:update", (payload) => {
    game = payload;
    if (payload.undoRequestBy && payload.undoRequestBy !== myRole && (myRole === "red" || myRole === "black")) {
      statusEl.textContent = `${payload.undoRequestBy === "red" ? "红方" : "黑方"}请求悔棋`;
    }
    render();
  });

  socket.on("room:error", ({ message }) => {
    statusEl.textContent = message || "操作失败";
  });
}

function boardCoords() {
  const coords = [];
  for (let row = 0; row < 10; row += 1) {
    for (let col = 0; col < 9; col += 1) coords.push({ row, col });
  }
  return flipped ? coords.reverse() : coords;
}

function fmtTime(total) {
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function render() {
  boardEl.innerHTML = "";
  const board = game?.board || Array.from({ length: 10 }, () => Array(9).fill(null));
  for (const { row, col } of boardCoords()) {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.row = row;
    cell.dataset.col = col;
    if (selected && selected.row === row && selected.col === col) cell.classList.add("selected");
    const piece = board[row][col];
    if (piece) {
      const img = document.createElement("img");
      img.className = "piece";
      img.src = pieceMap[piece.side][piece.type];
      img.alt = `${piece.side}-${piece.type}`;
      cell.appendChild(img);
    }
    cell.addEventListener("pointerdown", onCellClick);
    boardEl.appendChild(cell);
  }

  roomText.textContent = currentRoomId ? `房间号：${currentRoomId}` : "未加入房间";
  roleText.textContent = `身份：${myRole === "watcher" ? "观战" : myRole === "red" ? "红方" : "黑方"}`;
  timerText.textContent = `红方 ${fmtTime(game?.timeLeft?.red ?? 1800)} | 黑方 ${fmtTime(game?.timeLeft?.black ?? 1800)}`;
  const canRespondUndo = game?.undoRequestBy && game.undoRequestBy !== myRole && (myRole === "red" || myRole === "black");
  undoAcceptBtn.disabled = !canRespondUndo;
  undoRejectBtn.disabled = !canRespondUndo;
  if (game?.message) statusEl.textContent = game.message;
}

function onCellClick(event) {
  if (!socket || !game || game.winner || !currentRoomId) return;
  if (myRole !== game.turn) return;
  const row = Number(event.currentTarget.dataset.row);
  const col = Number(event.currentTarget.dataset.col);
  const piece = game.board[row][col];

  if (!selected) {
    if (!piece || piece.side !== game.turn) return;
    selected = { row, col };
    return render();
  }

  if (selected.row === row && selected.col === col) {
    selected = null;
    return render();
  }

  if (piece && piece.side === game.turn) {
    selected = { row, col };
    return render();
  }

  socket.emit("game:move", { from: selected, to: { row, col } });
  selected = null;
}

function roomIdFromInput() {
  return roomIdInput.value.trim().toUpperCase();
}

saveServerBtn.addEventListener("click", () => {
  const url = normalizeServerUrl(serverUrlInput.value);
  if (!url) return;
  writeServerUrl(url);
  serverUrlInput.value = url;
  connectSocket();
});

createRoomBtn.addEventListener("click", () => socket?.emit("room:create", { role: "red" }));
joinRoomBtn.addEventListener("click", () => {
  const roomId = roomIdFromInput();
  if (!roomId) return;
  socket?.emit("room:join", { roomId });
});
watchRoomBtn.addEventListener("click", () => {
  const roomId = roomIdFromInput();
  if (!roomId) return;
  socket?.emit("room:join", { roomId, role: "watcher" });
});
resetBtn.addEventListener("click", () => socket?.emit("game:reset"));
flipBtn.addEventListener("click", () => {
  flipped = !flipped;
  render();
});
undoBtn.addEventListener("click", () => socket?.emit("game:undo:request"));
undoAcceptBtn.addEventListener("click", () => socket?.emit("game:undo:respond", { accept: true }));
undoRejectBtn.addEventListener("click", () => socket?.emit("game:undo:respond", { accept: false }));

serverUrlInput.value = readServerUrl();
if (readQueryServerUrl()) writeServerUrl(serverUrlInput.value);
if (serverUrlInput.value) connectSocket();
render();
