// 캔버스 렌더링, 입력, 저장 입출력, 내려받기, 낭독 문구.

import {
  SIZE,
  PALETTE,
  createEditor,
  beginStroke,
  extendStroke,
  endStroke,
  undo,
  redo,
  clear,
  canUndo,
  canRedo,
  isEmpty,
  serializePixels,
  parsePixels,
} from './editor.js';
import { toRgba, exportFileName } from './png.js';

const STORAGE_KEY = 'pixel-editor:state';
const STORAGE_VERSION = 1;
const DEFAULT_COLOR = 1;
const DEFAULT_SCALE = 20;
const EXPORT_SCALES = [1, 20];
const URL_REVOKE_DELAY = 1000;

const MESSAGES = {
  saved: 'PNG로 저장했어요',
  empty: '빈 그림은 저장할 수 없어요. 먼저 점을 찍어 주세요.',
  failed: 'PNG를 만들지 못했어요',
  storage: '브라우저 저장을 쓸 수 없어 새로고침하면 그림이 사라져요',
};

const ARROWS = {
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
};

const canvas = document.getElementById('grid');
const context = canvas.getContext('2d');
const gridWrap = document.getElementById('grid-wrap');
const palette = document.getElementById('palette');
const currentSwatch = document.getElementById('current-swatch');
const currentText = document.getElementById('current-text');
const undoButton = document.getElementById('undo');
const redoButton = document.getElementById('redo');
const clearButton = document.getElementById('clear');
const saveButton = document.getElementById('save');
const sizeSelect = document.getElementById('export-size');
const statusLine = document.getElementById('status');
const live = document.getElementById('live');
const toolInputs = [...document.querySelectorAll('input[name="tool"]')];

// 저장값을 읽는다. 그림이 잘못되면 전부 기본값, 색이나 크기만 잘못되면 그 값만 기본값으로 한다.
const loadState = () => {
  const defaults = { pixels: null, color: DEFAULT_COLOR, exportScale: DEFAULT_SCALE };
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (data?.version !== STORAGE_VERSION) return defaults;
    const pixels = parsePixels(data.pixels);
    if (!pixels) return defaults;
    const isColor = Number.isInteger(data.color) && data.color >= 1 && data.color <= PALETTE.length;
    return {
      pixels,
      color: isColor ? data.color : DEFAULT_COLOR,
      exportScale: EXPORT_SCALES.includes(data.exportScale) ? data.exportScale : DEFAULT_SCALE,
    };
  } catch {
    return defaults;
  }
};

const initial = loadState();
const ed = createEditor(initial.pixels ?? undefined);
const cursor = { x: 0, y: 0 };
let color = initial.color;
let exportScale = initial.exportScale;
let tool = 'pen';
let cellSize = 1;
let theme = {};
let activePointerId = null;
let keyboardStroke = false;
let lastInputKeyboard = false;
let storageWarned = false;
let liveToggle = false;

const setStatus = (message) => {
  statusLine.textContent = message;
};

// 같은 문구가 이어져도 다시 읽히도록 끝에 보이지 않는 공백을 번갈아 붙인다.
const announce = (message) => {
  liveToggle = !liveToggle;
  live.textContent = liveToggle ? message : `${message} `;
};

const saveState = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: STORAGE_VERSION,
      pixels: serializePixels(ed.pixels),
      color,
      exportScale,
    }));
  } catch {
    if (!storageWarned) {
      storageWarned = true;
      setStatus(MESSAGES.storage);
    }
  }
};

const readTheme = () => {
  const styles = getComputedStyle(document.documentElement);
  const read = (name) => styles.getPropertyValue(name).trim();
  theme = {
    checkerA: read('--checker-a'),
    checkerB: read('--checker-b'),
    gridLine: read('--grid-line'),
    cursorOuter: read('--cursor-outer'),
    cursorInner: read('--cursor-inner'),
  };
};

const fillCell = (x, y, value) => {
  const left = x * cellSize;
  const top = y * cellSize;
  if (value !== 0) {
    context.fillStyle = PALETTE[value - 1].hex;
    context.fillRect(left, top, cellSize, cellSize);
    return;
  }
  // 투명 칸은 칸 하나를 2×2로 나눈 무늬로 그린다.
  const half = Math.floor(cellSize / 2);
  context.fillStyle = theme.checkerA;
  context.fillRect(left, top, cellSize, cellSize);
  context.fillStyle = theme.checkerB;
  context.fillRect(left + half, top, cellSize - half, half);
  context.fillRect(left, top + half, half, cellSize - half);
};

const strokeFrame = (left, top, size, thickness, fill) => {
  context.fillStyle = fill;
  context.fillRect(left, top, size, thickness);
  context.fillRect(left, top + size - thickness, size, thickness);
  context.fillRect(left, top, thickness, size);
  context.fillRect(left + size - thickness, top, thickness, size);
};

const drawCursor = () => {
  const thickness = Math.max(1, Math.round(cellSize / 12));
  const left = cursor.x * cellSize;
  const top = cursor.y * cellSize;
  strokeFrame(left, top, cellSize, thickness, theme.cursorOuter);
  if (cellSize > thickness * 2) {
    strokeFrame(left + thickness, top + thickness, cellSize - thickness * 2, thickness, theme.cursorInner);
  }
};

const render = () => {
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      fillCell(x, y, ed.pixels[y * SIZE + x]);
    }
  }
  context.fillStyle = theme.gridLine;
  for (let line = 0; line < SIZE; line += 1) {
    context.fillRect(line * cellSize, 0, 1, canvas.height);
    context.fillRect(0, line * cellSize, canvas.width, 1);
  }
  if (lastInputKeyboard && document.activeElement === canvas) drawCursor();
};

// 칸이 물리 픽셀의 정수 배가 되도록 캔버스 크기를 맞춘다.
const fitCanvas = () => {
  const ratio = window.devicePixelRatio || 1;
  const width = gridWrap.getBoundingClientRect().width;
  cellSize = Math.max(1, Math.floor(width * ratio / SIZE));
  const size = cellSize * SIZE;
  if (canvas.width !== size) canvas.width = size;
  if (canvas.height !== size) canvas.height = size;
  canvas.style.width = `${size / ratio}px`;
  canvas.style.height = `${size / ratio}px`;
  render();
};

const syncControls = () => {
  for (const input of toolInputs) input.checked = input.value === tool;
  palette.querySelectorAll('input')[color - 1].checked = true;

  const isEraser = tool === 'eraser';
  currentSwatch.hidden = isEraser;
  currentSwatch.style.backgroundColor = PALETTE[color - 1].hex;
  currentText.textContent = isEraser ? '지우개 사용 중' : `현재 색 ${PALETTE[color - 1].name}`;

  undoButton.setAttribute('aria-disabled', String(!canUndo(ed)));
  redoButton.setAttribute('aria-disabled', String(!canRedo(ed)));
};

// 그림을 바꾼 작업이 끝났을 때의 공통 처리.
const afterChange = () => {
  saveState();
  syncControls();
  render();
};

const currentValue = () => (tool === 'pen' ? color : 0);

const cellLabel = (x, y) => `${y + 1}행 ${x + 1}열`;

const announceCell = () => {
  const value = ed.pixels[cursor.y * SIZE + cursor.x];
  announce(`${cellLabel(cursor.x, cursor.y)}, ${value === 0 ? '빈 칸' : PALETTE[value - 1].name}`);
};

// 받침이 없거나 ㄹ 받침이면 '로', 그 외에는 '으로'를 붙인다.
const withRo = (name) => {
  const finalConsonant = (name.charCodeAt(name.length - 1) - 0xac00) % 28;
  return `${name}${finalConsonant === 0 || finalConsonant === 8 ? '로' : '으로'}`;
};

const announcePaint = () => {
  const action = tool === 'pen' ? `${withRo(PALETTE[color - 1].name)} 칠함` : '지움';
  announce(`${cellLabel(cursor.x, cursor.y)}, ${action}`);
};

// 획 진행 중의 도구 변경과 색 변경은 무시하고, 눌린 라디오는 원래 상태로 돌린다.
const setTool = (nextTool) => {
  if (ed.stroke) {
    syncControls();
    return false;
  }
  tool = nextTool;
  syncControls();
  return true;
};

// 색을 고르면 지우개 상태여도 펜으로 바뀐다.
const setColor = (nextColor) => {
  if (ed.stroke) {
    syncControls();
    return false;
  }
  const changed = nextColor !== color;
  color = nextColor;
  tool = 'pen';
  if (changed) saveState();
  syncControls();
  return true;
};

const doUndo = () => {
  if (!undo(ed)) return;
  afterChange();
  announce('되돌렸습니다');
};

const doRedo = () => {
  if (!redo(ed)) return;
  afterChange();
  announce('다시 실행했습니다');
};

const doClear = () => {
  if (!clear(ed)) return;
  afterChange();
  announce('전체를 지웠습니다');
};

const downloadBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), URL_REVOKE_DELAY);
};

const exportPng = () => {
  if (isEmpty(ed.pixels)) {
    setStatus(MESSAGES.empty);
    return;
  }
  try {
    const scale = exportScale;
    const fileName = exportFileName(new Date(), scale);
    const width = SIZE * scale;
    const output = document.createElement('canvas');
    output.width = width;
    output.height = width;
    output.getContext('2d').putImageData(new ImageData(toRgba(ed.pixels, scale), width, width), 0, 0);
    output.toBlob((blob) => {
      if (!blob) {
        setStatus(MESSAGES.failed);
        return;
      }
      try {
        downloadBlob(blob, fileName);
        setStatus(MESSAGES.saved);
      } catch {
        setStatus(MESSAGES.failed);
      }
    }, 'image/png');
  } catch {
    setStatus(MESSAGES.failed);
  }
};

const pointToCell = (event) => {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.floor((event.clientX - rect.left) / rect.width * SIZE),
    y: Math.floor((event.clientY - rect.top) / rect.height * SIZE),
  };
};

const finishPointerStroke = (event) => {
  if (event.pointerId !== activePointerId) return;
  activePointerId = null;
  if (endStroke(ed)) saveState();
  syncControls();
  render();
};

canvas.addEventListener('pointerdown', (event) => {
  canvas.focus({ preventScroll: true });
  if (!event.isPrimary || event.button !== 0 || ed.stroke) return;
  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {
    // 캡처에 실패해도 격자 안의 획은 그대로 이어 간다.
  }
  activePointerId = event.pointerId;
  const { x, y } = pointToCell(event);
  beginStroke(ed, x, y, currentValue());
  render();
});

canvas.addEventListener('pointermove', (event) => {
  if (event.pointerId !== activePointerId) return;
  const coalesced = event.getCoalescedEvents?.() ?? [];
  for (const item of coalesced.length > 0 ? coalesced : [event]) {
    const { x, y } = pointToCell(item);
    extendStroke(ed, x, y);
  }
  render();
});

canvas.addEventListener('pointerup', finishPointerStroke);
canvas.addEventListener('pointercancel', finishPointerStroke);
canvas.addEventListener('lostpointercapture', finishPointerStroke);
canvas.addEventListener('contextmenu', (event) => event.preventDefault());

const finishKeyboardStroke = () => {
  if (!keyboardStroke) return;
  keyboardStroke = false;
  if (endStroke(ed)) saveState();
  syncControls();
};

const paintAtCursor = () => {
  if (ed.stroke) return;
  beginStroke(ed, cursor.x, cursor.y, currentValue());
  if (endStroke(ed)) saveState();
  syncControls();
  render();
  announcePaint();
};

const moveCursor = ({ dx, dy }, shift) => {
  if (!shift) finishKeyboardStroke();
  // Shift 구간의 첫 입력에서는 시작 칸도 칠한다.
  if (shift && !ed.stroke) {
    beginStroke(ed, cursor.x, cursor.y, currentValue());
    keyboardStroke = true;
  }
  cursor.x = Math.min(SIZE - 1, Math.max(0, cursor.x + dx));
  cursor.y = Math.min(SIZE - 1, Math.max(0, cursor.y + dy));
  if (shift && keyboardStroke) {
    extendStroke(ed, cursor.x, cursor.y);
    announcePaint();
  } else {
    announceCell();
  }
  render();
};

const cycleColor = (step) => {
  const next = (color - 1 + step + PALETTE.length) % PALETTE.length + 1;
  if (setColor(next)) announce(PALETTE[next - 1].name);
};

const selectTool = (nextTool) => {
  if (setTool(nextTool)) announce(nextTool === 'pen' ? '펜' : '지우개');
};

// 글자 하나짜리 단축키는 화면 낭독기와 충돌하지 않도록 캔버스 포커스 때만 동작한다.
const canvasKeyActions = {
  KeyP: () => selectTool('pen'),
  KeyE: () => selectTool('eraser'),
  BracketLeft: () => cycleColor(-1),
  BracketRight: () => cycleColor(1),
};

canvas.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  const arrow = ARROWS[event.code];
  if (arrow) {
    event.preventDefault();
    moveCursor(arrow, event.shiftKey);
    return;
  }

  if (event.code === 'Space' || event.code === 'Enter' || event.code === 'NumpadEnter') {
    event.preventDefault();
    if (!event.repeat) paintAtCursor();
    return;
  }

  const action = canvasKeyActions[event.code];
  if (action) {
    event.preventDefault();
    action();
  }
});

canvas.addEventListener('keyup', (event) => {
  if (event.key === 'Shift') finishKeyboardStroke();
});

canvas.addEventListener('focus', render);

canvas.addEventListener('blur', () => {
  finishKeyboardStroke();
  render();
});

const setLastInput = (isKeyboard) => {
  if (lastInputKeyboard === isKeyboard) return;
  lastInputKeyboard = isKeyboard;
  if (document.activeElement === canvas) render();
};

document.addEventListener('pointerdown', () => setLastInput(false), true);

document.addEventListener('keydown', (event) => {
  setLastInput(true);
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;

  if (event.code === 'KeyZ') {
    event.preventDefault();
    if (event.shiftKey) doRedo();
    else doUndo();
  } else if (event.code === 'KeyY' && !event.shiftKey) {
    event.preventDefault();
    doRedo();
  } else if (event.code === 'KeyS' && !event.shiftKey) {
    event.preventDefault();
    if (!event.repeat) exportPng();
  }
});

for (const input of toolInputs) {
  input.addEventListener('change', () => setTool(input.value));
}

undoButton.addEventListener('click', doUndo);
redoButton.addEventListener('click', doRedo);
clearButton.addEventListener('click', doClear);
saveButton.addEventListener('click', exportPng);

sizeSelect.addEventListener('change', () => {
  exportScale = Number(sizeSelect.value);
  saveState();
});

const buildPalette = () => {
  PALETTE.forEach(({ name, hex }, index) => {
    const label = document.createElement('label');
    label.className = 'color';

    const input = document.createElement('input');
    input.className = 'radio';
    input.type = 'radio';
    input.name = 'color';
    input.value = String(index + 1);
    // 이미 선택된 색을 다시 눌러도 펜으로 돌아와야 하므로 change가 아니라 click을 쓴다.
    input.addEventListener('click', () => setColor(index + 1));

    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.backgroundColor = hex;

    const text = document.createElement('span');
    text.className = 'sr-only';
    text.textContent = name;

    label.append(input, swatch, text);
    palette.append(label);
  });
};

buildPalette();
sizeSelect.value = String(exportScale);
syncControls();
readTheme();
fitCanvas();

new ResizeObserver(fitCanvas).observe(gridWrap);
// 폭은 그대로이고 화면 배율만 바뀌는 경우(브라우저 확대·축소 등)도 다시 맞춘다.
window.addEventListener('resize', fitCanvas);

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  readTheme();
  render();
});
