import { ParticleType } from "./types";

/** Power-of-2 shift for 8×8 chunks — enables bit-shift indexing in the hot path. */
export const CHUNK_SHIFT = 3;
export const CHUNK_SIZE = 1 << CHUNK_SHIFT;

export class Grid {
  readonly width: number;
  readonly height: number;
  readonly cells: Uint8Array;
  readonly moved: Uint8Array;
  readonly lifetime: Uint16Array;
  readonly colorVariant: Uint8Array;

  readonly chunksX: number;
  readonly chunksY: number;

  readonly dirtyChunks: Uint8Array;
  readonly activeChunks: Uint8Array;
  activeCount = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    const size = width * height;
    this.cells = new Uint8Array(size);
    this.moved = new Uint8Array(size);
    this.lifetime = new Uint16Array(size);
    this.colorVariant = new Uint8Array(size);

    this.chunksX = (width + CHUNK_SIZE - 1) >> CHUNK_SHIFT;
    this.chunksY = (height + CHUNK_SIZE - 1) >> CHUNK_SHIFT;
    const numChunks = this.chunksX * this.chunksY;
    this.dirtyChunks = new Uint8Array(numChunks);
    this.activeChunks = new Uint8Array(numChunks);
  }

  markChunkDirtyXY(x: number, y: number): void {
    this.dirtyChunks[(y >> CHUNK_SHIFT) * this.chunksX + (x >> CHUNK_SHIFT)] = 1;
  }

  /**
   * Expand dirty set by 1 chunk in all directions → active set,
   * then propagate active upward through columns for gravity cascade.
   *
   * The simulation processes rows bottom-to-top, so falling particles
   * cascade upward through the processing order within a single frame.
   * Without upward propagation, the cascade stalls at the top of the
   * active region and only creeps up ~8 rows/frame.
   */
  buildActiveChunks(): number {
    const { chunksX, chunksY, dirtyChunks, activeChunks } = this;
    activeChunks.fill(0);

    for (let cy = 0; cy < chunksY; cy++) {
      for (let cx = 0; cx < chunksX; cx++) {
        if (!dirtyChunks[cy * chunksX + cx]) continue;

        const y0 = cy > 0 ? cy - 1 : 0;
        const y1 = cy < chunksY - 1 ? cy + 1 : cy;
        const x0 = cx > 0 ? cx - 1 : 0;
        const x1 = cx < chunksX - 1 ? cx + 1 : cx;

        for (let ny = y0; ny <= y1; ny++) {
          const row = ny * chunksX;
          for (let nx = x0; nx <= x1; nx++) {
            activeChunks[row + nx] = 1;
          }
        }
      }
    }

    // Gravity cascade: propagate active upward through columns.
    // Bottom-to-top processing lets particles fall into just-vacated cells,
    // but only within active chunks. If chunk below is active, chunk above
    // must also be active so the cascade can continue upward.
    for (let cx = 0; cx < chunksX; cx++) {
      for (let cy = chunksY - 2; cy >= 0; cy--) {
        if (activeChunks[(cy + 1) * chunksX + cx]) {
          activeChunks[cy * chunksX + cx] = 1;
        }
      }
    }

    dirtyChunks.fill(0);

    let count = 0;
    for (let i = 0; i < activeChunks.length; i++) {
      count += activeChunks[i]!;
    }
    this.activeCount = count;
    return count;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  get(x: number, y: number): ParticleType {
    if (!this.inBounds(x, y)) return ParticleType.Stone;
    return this.cells[y * this.width + x] as ParticleType;
  }

  set(x: number, y: number, type: ParticleType): void {
    if (!this.inBounds(x, y)) return;
    const idx = y * this.width + x;
    this.cells[idx] = type;
    this.colorVariant[idx] = (Math.random() * 256) | 0;
    this.lifetime[idx] = 0;
    this.markChunkDirtyXY(x, y);
  }

  setKeepVariant(x: number, y: number, type: ParticleType): void {
    if (!this.inBounds(x, y)) return;
    this.cells[y * this.width + x] = type;
    this.markChunkDirtyXY(x, y);
  }

  swap(x1: number, y1: number, x2: number, y2: number): void {
    if (!this.inBounds(x1, y1) || !this.inBounds(x2, y2)) return;
    const i1 = y1 * this.width + x1;
    const i2 = y2 * this.width + x2;

    let tmp = this.cells[i1]!;
    this.cells[i1] = this.cells[i2]!;
    this.cells[i2] = tmp;

    let tmp16 = this.lifetime[i1]!;
    this.lifetime[i1] = this.lifetime[i2]!;
    this.lifetime[i2] = tmp16;

    tmp = this.colorVariant[i1]!;
    this.colorVariant[i1] = this.colorVariant[i2]!;
    this.colorVariant[i2] = tmp;

    tmp = this.moved[i1]!;
    this.moved[i1] = this.moved[i2]!;
    this.moved[i2] = tmp;

    this.moved[i1] = 1;
    this.moved[i2] = 1;

    this.markChunkDirtyXY(x1, y1);
    this.markChunkDirtyXY(x2, y2);
  }

  moveTo(srcX: number, srcY: number, dstX: number, dstY: number): void {
    if (!this.inBounds(srcX, srcY) || !this.inBounds(dstX, dstY)) return;
    const si = srcY * this.width + srcX;
    const di = dstY * this.width + dstX;

    this.cells[di] = this.cells[si]!;
    this.lifetime[di] = this.lifetime[si]!;
    this.colorVariant[di] = this.colorVariant[si]!;

    this.cells[si] = ParticleType.Empty;
    this.lifetime[si] = 0;
    this.colorVariant[si] = 0;

    this.moved[di] = 1;
    this.moved[si] = 1;

    this.markChunkDirtyXY(srcX, srcY);
    this.markChunkDirtyXY(dstX, dstY);
  }

  getLifetime(x: number, y: number): number {
    return this.lifetime[y * this.width + x] ?? 0;
  }

  incrementLifetime(x: number, y: number): number {
    const idx = y * this.width + x;
    this.markChunkDirtyXY(x, y);
    return ++this.lifetime[idx]!;
  }

  isMoved(x: number, y: number): boolean {
    return this.moved[y * this.width + x] === 1;
  }

  markMoved(x: number, y: number): void {
    this.moved[y * this.width + x] = 1;
  }

  clearMoved(): void {
    this.moved.fill(0);
  }

  clear(): void {
    this.cells.fill(ParticleType.Empty);
    this.moved.fill(0);
    this.lifetime.fill(0);
    this.colorVariant.fill(0);
    this.dirtyChunks.fill(0);
    this.activeChunks.fill(0);
    this.activeCount = 0;
  }

  fillCircle(cx: number, cy: number, radius: number, type: ParticleType): void {
    const r2 = radius * radius;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= r2) {
          const px = cx + dx;
          const py = cy + dy;
          if (this.inBounds(px, py)) {
            const existing = this.cells[py * this.width + px] as ParticleType;
            if (type === ParticleType.Empty || existing === ParticleType.Empty) {
              this.set(px, py, type);
            }
          }
        }
      }
    }
  }
}
