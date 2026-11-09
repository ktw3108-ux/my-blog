// PNG 저장에 쓸 데이터 변환과 파일 이름. DOM에 의존하지 않는다.

import { SIZE, PALETTE } from './editor.js';

const hexToRgb = (hex) => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));

const PALETTE_RGB = PALETTE.map(({ hex }) => hexToRgb(hex));

// 한 칸을 scale × scale 픽셀로 그대로 복제한다. 값 0은 (0, 0, 0, 0)으로 남긴다.
export const toRgba = (pixels, scale) => {
  const width = SIZE * scale;
  const rgba = new Uint8ClampedArray(width * width * 4);

  for (let cellY = 0; cellY < SIZE; cellY += 1) {
    for (let cellX = 0; cellX < SIZE; cellX += 1) {
      const value = pixels[cellY * SIZE + cellX];
      if (value === 0) continue;
      const [red, green, blue] = PALETTE_RGB[value - 1];

      for (let y = cellY * scale; y < (cellY + 1) * scale; y += 1) {
        for (let x = cellX * scale; x < (cellX + 1) * scale; x += 1) {
          const offset = (y * width + x) * 4;
          rgba[offset] = red;
          rgba[offset + 1] = green;
          rgba[offset + 2] = blue;
          rgba[offset + 3] = 255;
        }
      }
    }
  }

  return rgba;
};

const pad = (value) => String(value).padStart(2, '0');

// 사용자 현지 시각으로 pixel-art-YYYYMMDD-HHmmss-크기.png 이름을 만든다.
export const exportFileName = (date, scale) => {
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  const width = SIZE * scale;
  return `pixel-art-${day}-${time}-${width}x${width}.png`;
};
