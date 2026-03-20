import { ParticleType } from "./types";
import { Grid, CHUNK_SIZE } from "./grid";
import { UPDATE_FN } from "./particles";

export class Simulation {
  readonly grid: Grid;
  private frameCount = 0;
  private sweepRight = true;

  constructor(width: number, height: number) {
    this.grid = new Grid(width, height);
  }

  step(): void {
    this.grid.clearMoved();
    this.grid.buildActiveChunks();
    this.frameCount++;
    this.sweepRight = !this.sweepRight;

    const grid = this.grid;
    const { width, height, chunksX, chunksY, activeChunks, cells, moved } = grid;
    const sweepRight = this.sweepRight;

    const cxStart = sweepRight ? 0 : chunksX - 1;
    const cxEnd = sweepRight ? chunksX : -1;
    const cxStep = sweepRight ? 1 : -1;

    for (let cy = chunksY - 1; cy >= 0; cy--) {
      const cellY0 = cy * CHUNK_SIZE;
      const cellY1 = cellY0 + CHUNK_SIZE < height ? cellY0 + CHUNK_SIZE : height;
      const chunkRow = cy * chunksX;

      for (let cx = cxStart; cx !== cxEnd; cx += cxStep) {
        if (!activeChunks[chunkRow + cx]) continue;

        const cellX0 = cx * CHUNK_SIZE;
        const cellX1 = cellX0 + CHUNK_SIZE < width ? cellX0 + CHUNK_SIZE : width;

        const xStart = sweepRight ? cellX0 : cellX1 - 1;
        const xEnd = sweepRight ? cellX1 : cellX0 - 1;
        const xStep = sweepRight ? 1 : -1;

        for (let y = cellY1 - 1; y >= cellY0; y--) {
          const rowOffset = y * width;

          for (let x = xStart; x !== xEnd; x += xStep) {
            const idx = rowOffset + x;
            if (moved[idx]) continue;
            const type = cells[idx]!;
            if (type === 0) continue;
            const fn = UPDATE_FN[type];
            if (fn) fn(grid, x, y);
          }
        }
      }
    }
  }

  paint(cx: number, cy: number, radius: number, type: ParticleType): void {
    this.grid.fillCircle(cx, cy, radius, type);
  }

  erase(cx: number, cy: number, radius: number): void {
    const r2 = radius * radius;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= r2) {
          const px = cx + dx;
          const py = cy + dy;
          if (this.grid.inBounds(px, py)) {
            const idx = py * this.grid.width + px;
            this.grid.cells[idx] = ParticleType.Empty;
            this.grid.lifetime[idx] = 0;
            this.grid.markChunkDirtyXY(px, py);
          }
        }
      }
    }
  }

  clear(): void {
    this.grid.clear();
  }

  getFrameCount(): number {
    return this.frameCount;
  }
}
