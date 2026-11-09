// 픽셀 아트 에디터의 그리기 규칙, 기록, 직렬화. DOM에 의존하지 않는다.

export const SIZE = 16;
export const MAX_HISTORY = 100;

// 표의 순서가 칸 값 1~12이자 화면 순서다.
export const PALETTE = [
  { name: '먹', hex: '#1c1b22' },
  { name: '회색', hex: '#8b90a0' },
  { name: '종이', hex: '#f7f5ee' },
  { name: '밤색', hex: '#8a5a3c' },
  { name: '빨강', hex: '#d6453d' },
  { name: '분홍', hex: '#e77fa8' },
  { name: '주황', hex: '#f08a3c' },
  { name: '노랑', hex: '#f7c948' },
  { name: '풀', hex: '#2f8a55' },
  { name: '하늘', hex: '#3fb6d3' },
  { name: '바다', hex: '#2a5caa' },
  { name: '보라', hex: '#8e6bd8' },
];

const PIXELS_PATTERN = new RegExp(`^[0-9a-c]{${SIZE * SIZE}}$`);

const isInside = (x, y) => x >= 0 && x < SIZE && y >= 0 && y < SIZE;

// 범위 밖 칸은 칠하지 않는다. 검사가 없으면 x = 16이 다음 줄 칸으로 번진다.
const paint = (ed, x, y, value) => {
  if (isInside(x, y)) ed.pixels[y * SIZE + x] = value;
};

const isSame = (a, b) => a.every((value, index) => value === b[index]);

// 그림이 바뀐 작업을 기록한다. 다시 실행 기록을 비우고 오래된 것부터 버린다.
const pushHistory = (ed, before) => {
  ed.undoStack.push(before);
  if (ed.undoStack.length > MAX_HISTORY) ed.undoStack.shift();
  ed.redoStack.length = 0;
};

export const createEditor = (pixels) => ({
  pixels: pixels ? Uint8Array.from(pixels) : new Uint8Array(SIZE * SIZE),
  undoStack: [],
  redoStack: [],
  stroke: null,
});

// Bresenham 직선. 양 끝을 포함하며 범위 밖 좌표도 그대로 돌려준다.
export const linePoints = (x0, y0, x1, y1) => {
  const points = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const stepX = x0 < x1 ? 1 : -1;
  const stepY = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  let x = x0;
  let y = y0;

  for (;;) {
    points.push({ x, y });
    if (x === x1 && y === y1) return points;
    const doubled = 2 * error;
    if (doubled >= dy) {
      error += dy;
      x += stepX;
    }
    if (doubled <= dx) {
      error += dx;
      y += stepY;
    }
  }
};

export const beginStroke = (ed, x, y, value) => {
  if (ed.stroke) return;
  ed.stroke = { before: ed.pixels.slice(), last: { x, y }, value };
  paint(ed, x, y, value);
};

export const extendStroke = (ed, x, y) => {
  const { stroke } = ed;
  if (!stroke || (stroke.last.x === x && stroke.last.y === y)) return;
  for (const point of linePoints(stroke.last.x, stroke.last.y, x, y)) {
    paint(ed, point.x, point.y, stroke.value);
  }
  stroke.last = { x, y };
};

// 그림이 바뀌어 기록되었는지 돌려준다. 획이 없으면 false이므로 중복 호출해도 안전하다.
export const endStroke = (ed) => {
  const { stroke } = ed;
  if (!stroke) return false;
  ed.stroke = null;
  if (isSame(stroke.before, ed.pixels)) return false;
  pushHistory(ed, stroke.before);
  return true;
};

export const canUndo = (ed) => ed.undoStack.length > 0;

export const canRedo = (ed) => ed.redoStack.length > 0;

export const undo = (ed) => {
  if (ed.stroke || !canUndo(ed)) return false;
  ed.redoStack.push(ed.pixels.slice());
  ed.pixels.set(ed.undoStack.pop());
  return true;
};

export const redo = (ed) => {
  if (ed.stroke || !canRedo(ed)) return false;
  ed.undoStack.push(ed.pixels.slice());
  ed.pixels.set(ed.redoStack.pop());
  return true;
};

export const isEmpty = (pixels) => pixels.every((value) => value === 0);

export const clear = (ed) => {
  if (ed.stroke || isEmpty(ed.pixels)) return false;
  pushHistory(ed, ed.pixels.slice());
  ed.pixels.fill(0);
  return true;
};

export const serializePixels = (pixels) => Array.from(pixels, (value) => value.toString(36)).join('');

// 형식이 맞지 않으면 null을 돌려준다.
export const parsePixels = (str) => {
  if (typeof str !== 'string' || !PIXELS_PATTERN.test(str)) return null;
  return Uint8Array.from(str, (char) => parseInt(char, 36));
};
