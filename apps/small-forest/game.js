// 작은 숲 키우기의 규칙 모듈. DOM에 의존하지 않고, 무작위는 rng 인자로 주입한다.

// 모든 규칙 수치는 이 객체 하나에 모은다.
export const CONFIG = Object.freeze({
  size: 5,
  startSeeds: 3,
  maxLevel: 5,
  seedChance: 0.9,
  stoneInterval: 8,
  mergeScores: Object.freeze({ 1: 10, 2: 30, 3: 80, 4: 200, 5: 500 }),
  multiplierStep: 0.5,
  maxMultiplier: 3,
});

const { size: SIZE } = CONFIG;

// 방향별로 줄 번호와 앞에서부터의 순번을 보드 좌표 [행, 열]로 바꾼다.
const LINE_COORD = Object.freeze({
  left: (line, step) => [line, step],
  right: (line, step) => [line, SIZE - 1 - step],
  up: (line, step) => [step, line],
  down: (line, step) => [SIZE - 1 - step, line],
});

const DIRECTIONS = Object.keys(LINE_COORD);

const NEIGHBORS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

const pick = (list, rng) => list[Math.floor(rng() * list.length)];

const emptyCells = (grid) => {
  const empties = [];
  grid.forEach((cells, row) => cells.forEach((cell, col) => {
    if (cell === null) empties.push([row, col]);
  }));
  return empties;
};

const isCorner = ([row, col]) => (row === 0 || row === SIZE - 1) && (col === 0 || col === SIZE - 1);

// 돌 없는 한 구간을 앞쪽으로 밀어 합친다. 합쳐진 타일은 앞 타일의 id를 잇는다.
const slideSegment = (cells) => {
  const tiles = cells.filter(Boolean);
  const result = [];
  const merges = [];
  for (let i = 0; i < tiles.length; i += 1) {
    const current = tiles[i];
    const following = tiles[i + 1];
    if (following && following.level === current.level) {
      merges.push({ index: result.length, level: current.level });
      result.push({ ...current, level: Math.min(CONFIG.maxLevel, current.level + 1) });
      i += 1;
    } else {
      result.push({ ...current });
    }
  }
  while (result.length < cells.length) result.push(null);
  return { result, merges };
};

// 보드 전체를 민 새 격자를 만든다. 입력 격자는 읽기만 한다.
const slideGrid = (grid, dir) => {
  const next = grid.map((row) => row.map((cell) => cell && { ...cell }));
  const merges = [];
  let moved = false;

  const applySegment = (coords) => {
    const { result, merges: segmentMerges } = slideSegment(coords.map(([r, c]) => grid[r][c]));
    coords.forEach(([r, c], i) => {
      if ((grid[r][c]?.id ?? null) !== (result[i]?.id ?? null)) moved = true;
      next[r][c] = result[i];
    });
    segmentMerges.forEach(({ index, level }) => {
      const [row, col] = coords[index];
      merges.push({ row, col, level });
    });
  };

  for (let line = 0; line < SIZE; line += 1) {
    const coords = Array.from({ length: SIZE }, (_, step) => LINE_COORD[dir](line, step));
    let start = 0;
    coords.forEach(([r, c], step) => {
      if (grid[r][c]?.kind === 'stone') {
        applySegment(coords.slice(start, step));
        start = step + 1;
      }
    });
    applySegment(coords.slice(start));
  }

  return { grid: next, merges, moved: moved || merges.length > 0 };
};

// 합치기 칸과 상하좌우로 맞닿은 돌을 없애고 부순 개수를 돌려준다.
const breakStones = (grid, merges) => {
  let broken = 0;
  merges.forEach(({ row, col }) => {
    NEIGHBORS.forEach(([dr, dc]) => {
      const r = row + dr;
      const c = col + dc;
      if (grid[r]?.[c]?.kind === 'stone') {
        grid[r][c] = null;
        broken += 1;
      }
    });
  });
  return broken;
};

const scoreMerges = (merges) => {
  if (merges.length === 0) return { gained: 0, bonus: 0 };
  const base = merges.reduce((sum, { level }) => sum + CONFIG.mergeScores[level], 0);
  const multiplier = Math.min(
    CONFIG.maxMultiplier,
    1 + CONFIG.multiplierStep * (merges.length - 1),
  );
  const gained = base * multiplier;
  return { gained, bonus: gained - base };
};

// 빈 칸 중 무작위 한 칸의 좌표를 고른다. 돌은 귀퉁이가 아닌 칸을 우선한다.
const chooseStoneCell = (grid, rng) => {
  const empties = emptyCells(grid);
  const inner = empties.filter((cell) => !isCorner(cell));
  const candidates = inner.length > 0 ? inner : empties;
  return candidates.length > 0 ? pick(candidates, rng) : null;
};

export const createGame = (rng = Math.random) => {
  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  let nextId = 1;
  for (let i = 0; i < CONFIG.startSeeds; i += 1) {
    const [row, col] = pick(emptyCells(grid), rng);
    grid[row][col] = { id: nextId, kind: 'tile', level: 1 };
    nextId += 1;
  }
  return { grid, score: 0, stoneCountdown: CONFIG.stoneInterval, over: false, nextId };
};

export const hasMoves = (state) => DIRECTIONS.some((dir) => slideGrid(state.grid, dir).moved);

export const move = (state, dir, rng = Math.random) => {
  const unchanged = {
    state,
    moved: false,
    pairs: 0,
    gained: 0,
    bonus: 0,
    broken: 0,
    spawned: null,
    droppedStone: null,
  };
  if (state.over || !LINE_COORD[dir]) return unchanged;

  const { grid, merges, moved } = slideGrid(state.grid, dir);
  if (!moved) return unchanged;

  const broken = breakStones(grid, merges);
  const { gained, bonus } = scoreMerges(merges);
  let { nextId } = state;

  // 새 타일을 놓는다. 유효 이동 뒤에는 빈 칸이 항상 있다.
  const [spawnRow, spawnCol] = pick(emptyCells(grid), rng);
  const level = rng() < CONFIG.seedChance ? 1 : 2;
  grid[spawnRow][spawnCol] = { id: nextId, kind: 'tile', level };
  const spawned = { row: spawnRow, col: spawnCol, id: nextId, level };
  nextId += 1;

  // 돌 카운트를 줄인다. 빈 칸이 없으면 0으로 둔 채 다음 유효 이동까지 미룬다.
  let stoneCountdown = Math.max(0, state.stoneCountdown - 1);
  let droppedStone = null;
  if (stoneCountdown === 0) {
    const cell = chooseStoneCell(grid, rng);
    if (cell) {
      const [row, col] = cell;
      grid[row][col] = { id: nextId, kind: 'stone' };
      droppedStone = { row, col, id: nextId };
      nextId += 1;
      stoneCountdown = CONFIG.stoneInterval;
    }
  }

  const nextState = {
    grid,
    score: state.score + gained,
    stoneCountdown,
    over: false,
    nextId,
  };
  nextState.over = !hasMoves(nextState);

  return {
    state: nextState,
    moved: true,
    pairs: merges.length,
    gained,
    bonus,
    broken,
    spawned,
    droppedStone,
  };
};
