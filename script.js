const GLYPHS = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' };
const FILES = 'abcdefgh';

const menuEl = document.getElementById('menu');
const gameEl = document.getElementById('game');
const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const bannerEl = document.getElementById('banner');
const winnerOverlay = document.getElementById('winner-overlay');
const winnerText = document.getElementById('winner-text');

let board = null;
let currentTurn = 'w';
let selected = null;
let moveHints = [];
let enPassant = null;
let lastMove = null;
let gameOver = false;
let bannerTimer = null;

function opposite(color) {
  return color === 'w' ? 'b' : 'w';
}

function inBoard(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function initBoard() {
  board = Array.from({ length: 8 }, () => Array(8).fill(null));
  const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  for (let c = 0; c < 8; c++) {
    board[0][c] = { type: back[c], color: 'b', moved: false };
    board[1][c] = { type: 'p', color: 'b', moved: false };
    board[6][c] = { type: 'p', color: 'w', moved: false };
    board[7][c] = { type: back[c], color: 'w', moved: false };
  }
}

function pawnMoves(r, c, piece) {
  const moves = [];
  const dir = piece.color === 'w' ? -1 : 1;
  const startRow = piece.color === 'w' ? 6 : 1;
  const f = r + dir;
  if (inBoard(f, c) && !board[f][c]) {
    moves.push([f, c]);
    if (r === startRow && !board[r + 2 * dir][c]) moves.push([r + 2 * dir, c]);
  }
  for (const dc of [-1, 1]) {
    const nc = c + dc;
    if (!inBoard(f, nc)) continue;
    const target = board[f][nc];
    if (target && target.color !== piece.color) {
      moves.push([f, nc]);
    } else if (!target && enPassant && enPassant.row === f && enPassant.col === nc) {
      moves.push([f, nc]);
    }
  }
  return moves;
}

function knightMoves(r, c, piece) {
  const moves = [];
  const offsets = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  for (const [dr, dc] of offsets) {
    const nr = r + dr, nc = c + dc;
    if (inBoard(nr, nc) && (!board[nr][nc] || board[nr][nc].color !== piece.color)) {
      moves.push([nr, nc]);
    }
  }
  return moves;
}

function slidingMoves(r, c, piece, dirs) {
  const moves = [];
  for (const [dr, dc] of dirs) {
    let nr = r + dr, nc = c + dc;
    while (inBoard(nr, nc)) {
      const target = board[nr][nc];
      if (!target) {
        moves.push([nr, nc]);
      } else {
        if (target.color !== piece.color) moves.push([nr, nc]);
        break;
      }
      nr += dr;
      nc += dc;
    }
  }
  return moves;
}

function kingMoves(r, c, piece, skipCastling) {
  const moves = [];
  const offsets = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  for (const [dr, dc] of offsets) {
    const nr = r + dr, nc = c + dc;
    if (inBoard(nr, nc) && (!board[nr][nc] || board[nr][nc].color !== piece.color)) {
      moves.push([nr, nc]);
    }
  }
  if (skipCastling || piece.moved) return moves;
  const enemy = opposite(piece.color);
  if (!isSquareAttacked(r, c, enemy)) {
    const rookK = board[r][7];
    if (rookK && rookK.type === 'r' && rookK.color === piece.color && !rookK.moved
        && !board[r][6] && !board[r][5]
        && !isSquareAttacked(r, 5, enemy) && !isSquareAttacked(r, 6, enemy)) {
      moves.push([r, 6]);
    }
    const rookQ = board[r][0];
    if (rookQ && rookQ.type === 'r' && rookQ.color === piece.color && !rookQ.moved
        && !board[r][1] && !board[r][2] && !board[r][3]
        && !isSquareAttacked(r, 3, enemy) && !isSquareAttacked(r, 2, enemy)) {
      moves.push([r, 2]);
    }
  }
  return moves;
}

function pseudoLegalMoves(r, c, skipCastling) {
  const piece = board[r][c];
  if (!piece) return [];
  switch (piece.type) {
    case 'p': return pawnMoves(r, c, piece);
    case 'n': return knightMoves(r, c, piece);
    case 'b': return slidingMoves(r, c, piece, [[-1, -1], [-1, 1], [1, -1], [1, 1]]);
    case 'r': return slidingMoves(r, c, piece, [[-1, 0], [1, 0], [0, -1], [0, 1]]);
    case 'q': return slidingMoves(r, c, piece, [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]);
    case 'k': return kingMoves(r, c, piece, skipCastling);
  }
  return [];
}

function findKing(color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.type === 'k' && p.color === color) return [r, c];
    }
  }
  return null;
}

function isSquareAttacked(r, c, byColor) {
  for (let rr = 0; rr < 8; rr++) {
    for (let cc = 0; cc < 8; cc++) {
      const p = board[rr][cc];
      if (!p || p.color !== byColor) continue;
      for (const [tr, tc] of pseudoLegalMoves(rr, cc, true)) {
        if (tr === r && tc === c) return true;
      }
    }
  }
  return false;
}

function legalMoves(r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  const king = findKing(piece.color);
  const result = [];
  for (const [tr, tc] of pseudoLegalMoves(r, c)) {
    const captured = board[tr][tc];
    let epPawn = null;
    const isEp = !captured && piece.type === 'p'
      && enPassant && enPassant.row === tr && enPassant.col === tc;
    if (isEp) {
      const dir = piece.color === 'w' ? -1 : 1;
      epPawn = board[enPassant.row - dir][tc];
      board[enPassant.row - dir][tc] = null;
    }
    board[tr][tc] = piece;
    board[r][c] = null;
    const kingCheck = piece.type === 'k' ? [tr, tc] : king;
    const safe = !isSquareAttacked(kingCheck[0], kingCheck[1], opposite(piece.color));
    board[r][c] = piece;
    board[tr][tc] = captured;
    if (isEp) board[enPassant.row - (piece.color === 'w' ? -1 : 1)][tc] = epPawn;
    if (safe) result.push([tr, tc]);
  }
  return result;
}

function hasAnyLegalMove(color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.color === color && legalMoves(r, c).length > 0) return true;
    }
  }
  return false;
}

function applyMove(r, c, tr, tc) {
  const piece = board[r][c];
  if (piece.type === 'p' && !board[tr][tc]
      && enPassant && enPassant.row === tr && enPassant.col === tc) {
    const dir = piece.color === 'w' ? -1 : 1;
    board[enPassant.row - dir][tc] = null;
  }
  board[tr][tc] = piece;
  board[r][c] = null;
  piece.moved = true;
  lastMove = [r, c, tr, tc];
  if (piece.type === 'k') {
    if (tc - c === 2) {
      board[r][5] = board[r][7];
      board[r][7] = null;
      board[r][5].moved = true;
    } else if (tc - c === -2) {
      board[r][3] = board[r][0];
      board[r][0] = null;
      board[r][3].moved = true;
    }
  }
  enPassant = (piece.type === 'p' && Math.abs(tr - r) === 2)
    ? { row: (r + tr) / 2, col: c }
    : null;
  if (piece.type === 'p' && (tr === 0 || tr === 7)) {
    board[tr][tc] = { type: 'q', color: piece.color, moved: true };
  }
}

function endTurn() {
  const next = opposite(currentTurn);
  const king = findKing(next);
  const inCheck = !!king && isSquareAttacked(king[0], king[1], currentTurn);
  if (!hasAnyLegalMove(next)) {
    gameOver = true;
    showWinner(inCheck ? currentTurn : null);
    return;
  }
  currentTurn = next;
  updateStatus(inCheck);
  showBanner('Vez do Jogador ' + (next === 'w' ? 'Branco' : 'Preto'));
}

function renderBoard() {
  boardEl.innerHTML = '';
  const selectedKey = selected ? selected[0] + ',' + selected[1] : null;
  const hintSet = new Set(moveHints.map(([r, c]) => r + ',' + c));
  const checkedKey = (() => {
    if (gameOver) return null;
    const k = findKing(currentTurn);
    if (k && isSquareAttacked(k[0], k[1], opposite(currentTurn))) return k[0] + ',' + k[1];
    return null;
  })();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
      cell.dataset.r = r;
      cell.dataset.c = c;
      const key = r + ',' + c;
      if (key === selectedKey) cell.classList.add('selected');
      if (lastMove && key === lastMove[0] + ',' + lastMove[1]) cell.classList.add('last-from');
      if (lastMove && key === lastMove[2] + ',' + lastMove[3]) cell.classList.add('last-to');
      if (key === checkedKey) cell.classList.add('in-check');
      if (hintSet.has(key)) {
        if (board[r][c]) cell.classList.add('capture');
        else cell.classList.add('hint');
      }
      const p = board[r][c];
      if (p) {
        const span = document.createElement('span');
        span.className = 'piece ' + (p.color === 'w' ? 'white' : 'black');
        span.textContent = GLYPHS[p.type];
        cell.appendChild(span);
      }
      if (c === 0) {
        const s = document.createElement('span');
        s.className = 'coord coord-rank';
        s.textContent = 8 - r;
        cell.appendChild(s);
      }
      if (r === 7) {
        const s = document.createElement('span');
        s.className = 'coord coord-file';
        s.textContent = FILES[c];
        cell.appendChild(s);
      }
      boardEl.appendChild(cell);
    }
  }
}

function selectPiece(r, c) {
  selected = [r, c];
  moveHints = legalMoves(r, c);
  renderBoard();
}

function clearSelection() {
  selected = null;
  moveHints = [];
}

function updateStatus(inCheck) {
  const name = currentTurn === 'w' ? 'Branco' : 'Preto';
  statusEl.textContent = 'Vez do Jogador ' + name + (inCheck ? ' — Xeque!' : '');
}

function showBanner(text) {
  bannerEl.textContent = text;
  bannerEl.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => bannerEl.classList.remove('show'), 1800);
}

function showWinner(winner) {
  winnerText.textContent = winner
    ? 'Vencedor: Jogador ' + (winner === 'w' ? 'Branco' : 'Preto')
    : 'Empate (afogamento)';
  winnerOverlay.classList.remove('hidden');
}

function startGame() {
  initBoard();
  currentTurn = 'w';
  selected = null;
  moveHints = [];
  enPassant = null;
  lastMove = null;
  gameOver = false;
  winnerOverlay.classList.add('hidden');
  renderBoard();
  updateStatus(false);
  showBanner('Vez do Jogador Branco');
}

boardEl.addEventListener('click', (e) => {
  if (gameOver) return;
  const cell = e.target.closest('.cell');
  if (!cell) return;
  const r = +cell.dataset.r;
  const c = +cell.dataset.c;
  const piece = board[r][c];

  if (selected) {
    if (moveHints.some(([tr, tc]) => tr === r && tc === c)) {
      applyMove(selected[0], selected[1], r, c);
      clearSelection();
      endTurn();
      renderBoard();
      return;
    }
    if (piece && piece.color === currentTurn) {
      selectPiece(r, c);
      return;
    }
    clearSelection();
    renderBoard();
    return;
  }

  if (piece && piece.color === currentTurn) {
    selectPiece(r, c);
  }
});

document.getElementById('play-btn').addEventListener('click', () => {
  menuEl.classList.add('hidden');
  gameEl.classList.remove('hidden');
  startGame();
});

document.getElementById('replay-btn').addEventListener('click', startGame);