import { ParticleType } from "./types";

export class Grid {
  readonly width: number;
  readonly height: number;
  readonly cells: Uint8Array;
  readonly moved: Uint8Array;
  readonly lifetime: Uint16Array;
  readonly colorVariant: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    const size = width * height;
    this.cells = new Uint8Array(size);
    this.moved = new Uint8Array(size);
    this.lifetime = new Uint16Array(size);
    this.colorVariant = new Uint8Array(size);
  }

  index(x: number, y: number): number {
    return y * this.width + x;
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
  }

  setKeepVariant(x: number, y: number, type: ParticleType): void {
    if (!this.inBounds(x, y)) return;
    this.cells[y * this.width + x] = type;
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
  }

  getLifetime(x: number, y: number): number {
    return this.lifetime[y * this.width + x] ?? 0;
  }

  incrementLifetime(x: number, y: number): number {
    const idx = y * this.width + x;
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
