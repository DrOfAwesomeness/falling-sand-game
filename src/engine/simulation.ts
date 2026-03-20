import { ParticleType } from "./types";
import { Grid } from "./grid";
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
    this.frameCount++;
    this.sweepRight = !this.sweepRight;

    const { width, height } = this.grid;

    for (let y = height - 1; y >= 0; y--) {
      const xStart = this.sweepRight ? 0 : width - 1;
      const xEnd = this.sweepRight ? width : -1;
      const xStep = this.sweepRight ? 1 : -1;

      for (let x = xStart; x !== xEnd; x += xStep) {
        if (this.grid.isMoved(x, y)) continue;
        const type = this.grid.get(x, y) as ParticleType;
        if (type === ParticleType.Empty) continue;
        const fn = UPDATE_FN[type];
        if (fn) fn(this.grid, x, y);
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
