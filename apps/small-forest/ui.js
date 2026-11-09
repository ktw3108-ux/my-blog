// 화면 렌더링, 입력, 애니메이션, 낭독 문구, 최고 기록 저장을 맡는다.
import { CONFIG, createGame, move } from './game.js';

const BEST_KEY = 'small-forest:best';
const SLIDE_MS = 120;
const POP_MS = 150;
const NOTICE_MS = 2400;
const SWIPE_MIN_PX = 24;
const SVG_NS = 'http://www.w3.org/2000/svg';

const STAGE_NAMES = { 1: '씨앗', 2: '새싹', 3: '묘목', 4: '나무', 5: '숲' };

const DIRECTIONS = {
  left: { label: '왼쪽', step: [0, -1] },
  right: { label: '오른쪽', step: [0, 1] },
  up: { label: '위쪽', step: [-1, 0] },
  down: { label: '아래쪽', step: [1, 0] },
};

const KEY_DIRECTIONS = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

const byId = (id) => document.getElementById(id);

const boardEl = byId('board');
const cellsLayer = byId('cells');
const tilesLayer = byId('tiles');
const overEl = byId('over');
const overScoreEl = byId('over-score');
const overRecordEl = byId('over-record');
const overNewButton = byId('over-new');
const noticeEl = byId('notice');
const scoreEl = byId('score');
const bestEl = byId('best');
const bonusEl = byId('bonus');
const stoneTextEl = byId('stone-text');
const stoneTicksEl = byId('stone-ticks');
const newButton = byId('new-game');
const readButton = byId('read-board');
const liveEl = byId('live');

const tileEls = new Map();

let state = createGame();
let best = 0;
let isNewRecord = false;
let forestSeen = false;
let busy = false;
let queued = null;
let moveTimer = 0;
let noticeTimer = 0;
let activePointer = null;

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const readBest = () => {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (raw === null || !/^\d+$/.test(raw)) return 0;
    const value = Number(raw);
    return Number.isSafeInteger(value) ? value : 0;
  } catch {
    return 0;
  }
};

const writeBest = (value) => {
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // 저장소를 쓸 수 없어도 메모리 값으로 계속 동작한다
  }
};

const announce = (message) => {
  liveEl.textContent = message;
};

const forEachCell = (grid, visit) => {
  grid.forEach((cells, row) => cells.forEach((cell, col) => {
    if (cell) visit(cell, row, col);
  }));
};

const findCell = (grid, id) => {
  let found = null;
  forEachCell(grid, (cell, row, col) => {
    if (cell.id === id) found = { row, col };
  });
  return found;
};

const placeTile = (el, row, col) => {
  el.style.setProperty('--row', row);
  el.style.setProperty('--col', col);
};

const paintTile = (el, cell) => {
  const isStone = cell.kind === 'stone';
  const symbol = isStone ? 'stone' : `stage-${cell.level}`;
  el.querySelector('.tile-face').className = `tile-face ${symbol}`;
  el.querySelector('use').setAttribute('href', `#${symbol}`);
  el.querySelector('.tile-level').textContent = isStone ? '' : String(cell.level);
};

const createTileEl = (cell) => {
  const el = document.createElement('div');
  el.className = 'tile';
  const face = document.createElement('div');
  face.className = 'tile-face';
  const level = document.createElement('span');
  level.className = 'tile-level';
  const art = document.createElementNS(SVG_NS, 'svg');
  art.setAttribute('class', 'tile-art');
  art.setAttribute('viewBox', '0 0 48 48');
  art.append(document.createElementNS(SVG_NS, 'use'));
  face.append(level, art);
  el.append(face);
  paintTile(el, cell);
  return el;
};

// 격자 상태에 맞춰 타일 DOM을 만들고, 옮기고, 지운다.
const renderBoard = (grid) => {
  const present = new Set();
  forEachCell(grid, (cell, row, col) => {
    present.add(cell.id);
    let el = tileEls.get(cell.id);
    if (!el) {
      el = createTileEl(cell);
      tileEls.set(cell.id, el);
      tilesLayer.append(el);
    }
    paintTile(el, cell);
    placeTile(el, row, col);
  });
  tileEls.forEach((el, id) => {
    if (!present.has(id)) {
      el.remove();
      tileEls.delete(id);
    }
  });
};

// 소비된 타일의 합치기 상대는 이전 격자에서 앞쪽으로 처음 만나는 타일이다.
const findPartner = (grid, row, col, dir) => {
  const [dr, dc] = DIRECTIONS[dir].step;
  let r = row + dr;
  let c = col + dc;
  while (grid[r]?.[c] === null) {
    r += dr;
    c += dc;
  }
  return grid[r]?.[c] ?? null;
};

// 슬라이드 단계: 살아남은 타일과 소비될 타일을 도착 칸으로 옮기고, 합쳐진 타일 id를 돌려준다.
const slideTiles = (prevGrid, nextGrid, dir) => {
  const mergedIds = new Set();
  forEachCell(nextGrid, (cell, row, col) => {
    const el = tileEls.get(cell.id);
    if (el) placeTile(el, row, col);
  });
  forEachCell(prevGrid, (cell, row, col) => {
    if (cell.kind !== 'tile' || findCell(nextGrid, cell.id)) return;
    const partner = findPartner(prevGrid, row, col, dir);
    const target = partner && findCell(nextGrid, partner.id);
    if (!target) return;
    mergedIds.add(partner.id);
    const el = tileEls.get(cell.id);
    el.classList.add('consumed');
    placeTile(el, target.row, target.col);
  });
  return mergedIds;
};

const faceOf = (id) => tileEls.get(id)?.querySelector('.tile-face');

// 부서지는 돌은 애니메이션이 끝날 때까지 DOM에 남겨 두고 관리 목록에서만 뺀다.
const detachBrokenStones = (prevGrid, nextGrid) => {
  const leaving = [];
  forEachCell(prevGrid, (cell) => {
    if (cell.kind !== 'stone' || findCell(nextGrid, cell.id)) return;
    const el = tileEls.get(cell.id);
    el.querySelector('.tile-face').classList.add('breaking');
    tileEls.delete(cell.id);
    leaving.push(el);
  });
  return leaving;
};

const stoneMessage = () => (
  state.stoneCountdown === 0 ? '돌이 곧 떨어져요' : `다음 돌까지 ${state.stoneCountdown}번`
);

const bonusText = ({ pairs, gained, bonus }) => {
  if (pairs <= 1) return '-';
  return `×${gained / (gained - bonus)} +${bonus}`;
};

const renderStatus = (bonusLabel) => {
  scoreEl.textContent = String(state.score);
  bestEl.textContent = String(best);
  bonusEl.textContent = bonusLabel;
  stoneTextEl.textContent = stoneMessage();
  [...stoneTicksEl.children].forEach((tick, index) => {
    tick.classList.toggle('on', index < state.stoneCountdown);
  });
};

const updateBest = () => {
  if (state.score <= best) return;
  best = state.score;
  isNewRecord = true;
  writeBest(best);
};

const hideNotice = () => {
  clearTimeout(noticeTimer);
  noticeEl.hidden = true;
};

const showNotice = (message) => {
  hideNotice();
  noticeEl.textContent = message;
  noticeEl.hidden = false;
  noticeTimer = setTimeout(hideNotice, NOTICE_MS);
};

const checkFirstForest = () => {
  if (forestSeen) return false;
  forestSeen = state.grid.some((cells) => cells.some((cell) => cell?.level === CONFIG.maxLevel));
  return forestSeen;
};

const moveMessage = (dir, result, firstForest) => {
  const parts = [`${DIRECTIONS[dir].label}으로 이동.`];
  if (result.pairs > 0) parts.push(`합치기 ${result.pairs}쌍, ${result.gained}점.`);
  if (result.broken > 0) parts.push(`돌 ${result.broken}개 부서짐.`);
  if (result.droppedStone) parts.push('돌 1개 떨어짐.');
  if (firstForest) parts.push('첫 숲이 자랐어요.');
  parts.push(`${stoneMessage()}.`);
  if (state.over) {
    parts.push(`더 자랄 자리가 없어요. 최종 점수 ${state.score}점.`);
    if (isNewRecord) parts.push('새 최고 기록.');
  }
  return parts.join(' ');
};

// 슬라이드 이후 단계: 합치기·돌 변화·새 타일과 점수, 낭독 문구를 반영한다.
const applyResult = (prevGrid, result, dir, mergedIds) => {
  const animated = mergedIds !== null;
  const leaving = animated ? detachBrokenStones(prevGrid, state.grid) : [];
  renderBoard(state.grid);
  if (animated) {
    mergedIds.forEach((id) => faceOf(id)?.classList.add('merged'));
    faceOf(result.spawned.id)?.classList.add('appear');
    if (result.droppedStone) faceOf(result.droppedStone.id)?.classList.add('drop');
  }
  renderStatus(bonusText(result));
  const firstForest = checkFirstForest();
  if (firstForest) showNotice('첫 숲이 자랐어요');
  announce(moveMessage(dir, result, firstForest));
  return leaving;
};

const showGameOver = () => {
  overScoreEl.textContent = `최종 점수 ${state.score}점`;
  overRecordEl.hidden = !isNewRecord;
  overEl.hidden = false;
  overNewButton.focus();
};

const clearEffects = () => {
  tilesLayer.querySelectorAll('.merged, .appear, .drop').forEach((face) => {
    face.classList.remove('merged', 'appear', 'drop');
  });
};

const finishTurn = () => {
  if (state.over) {
    queued = null;
    showGameOver();
    return;
  }
  if (queued !== null) {
    const next = queued;
    queued = null;
    performMove(next);
  }
};

const performMove = (dir) => {
  if (state.over) return;
  if (busy) {
    if (queued === null) queued = dir;
    return;
  }
  const prevGrid = state.grid;
  const result = move(state, dir);
  if (!result.moved) {
    announce('움직일 수 없는 방향입니다');
    return;
  }
  state = result.state;
  updateBest();

  if (prefersReducedMotion()) {
    applyResult(prevGrid, result, dir, null);
    finishTurn();
    return;
  }

  busy = true;
  const mergedIds = slideTiles(prevGrid, state.grid, dir);
  moveTimer = setTimeout(() => {
    const leaving = applyResult(prevGrid, result, dir, mergedIds);
    moveTimer = setTimeout(() => {
      leaving.forEach((el) => el.remove());
      clearEffects();
      busy = false;
      finishTurn();
    }, POP_MS);
  }, SLIDE_MS);
};

const startNewGame = () => {
  clearTimeout(moveTimer);
  hideNotice();
  busy = false;
  queued = null;
  isNewRecord = false;
  forestSeen = false;
  tileEls.clear();
  tilesLayer.replaceChildren();
  state = createGame();
  renderBoard(state.grid);
  renderStatus('-');
  overEl.hidden = true;
};

const describeCell = (cell) => {
  if (cell === null) return '빈 칸';
  return cell.kind === 'stone' ? '돌' : STAGE_NAMES[cell.level];
};

const readBoard = () => {
  const lines = state.grid.map((cells, row) => `${row + 1}행: ${cells.map(describeCell).join(', ')}.`);
  announce(lines.join(' '));
};

const handleKeydown = (event) => {
  const dir = KEY_DIRECTIONS[event.key];
  if (!dir || event.ctrlKey || event.altKey || event.metaKey) return;
  // 누르고 있어도 페이지가 스크롤되지 않도록 반복 입력도 기본 동작은 막는다
  event.preventDefault();
  if (!event.repeat) performMove(dir);
};

const handlePointerDown = (event) => {
  if (!event.isPrimary || event.button !== 0 || activePointer !== null) return;
  activePointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  try {
    boardEl.setPointerCapture(event.pointerId);
  } catch {
    // 이미 끝난 포인터면 캡처 없이 계속한다
  }
};

const handlePointerUp = (event) => {
  if (activePointer?.id !== event.pointerId) return;
  const dx = event.clientX - activePointer.x;
  const dy = event.clientY - activePointer.y;
  activePointer = null;
  if (Math.hypot(dx, dy) < SWIPE_MIN_PX) return;
  if (Math.abs(dx) > Math.abs(dy)) {
    performMove(dx > 0 ? 'right' : 'left');
  } else {
    performMove(dy > 0 ? 'down' : 'up');
  }
};

const handlePointerCancel = (event) => {
  if (activePointer?.id === event.pointerId) activePointer = null;
};

const buildStaticParts = () => {
  const cells = Array.from({ length: CONFIG.size ** 2 }, () => {
    const cell = document.createElement('div');
    cell.className = 'cell';
    return cell;
  });
  cellsLayer.replaceChildren(...cells);

  const ticks = Array.from({ length: CONFIG.stoneInterval }, () => {
    const tick = document.createElement('span');
    tick.className = 'tick';
    return tick;
  });
  stoneTicksEl.replaceChildren(...ticks);
};

const bindEvents = () => {
  document.addEventListener('keydown', handleKeydown);
  boardEl.addEventListener('pointerdown', handlePointerDown);
  boardEl.addEventListener('pointerup', handlePointerUp);
  boardEl.addEventListener('pointercancel', handlePointerCancel);

  document.querySelectorAll('[data-dir]').forEach((button) => {
    button.addEventListener('click', () => performMove(button.dataset.dir));
  });

  newButton.addEventListener('click', () => {
    startNewGame();
    announce('새 게임을 시작했어요.');
  });
  overNewButton.addEventListener('click', () => {
    startNewGame();
    announce('새 게임을 시작했어요.');
    // 덮개가 사라져도 포커스를 잃지 않게 옮긴다
    newButton.focus();
  });
  readButton.addEventListener('click', readBoard);
};

best = readBest();
buildStaticParts();
bindEvents();
renderBoard(state.grid);
renderStatus('-');
