import { ParticleType, PARTICLE_COLORS, PARTICLE_COUNT } from "./types";
import type { Grid } from "./grid";

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private imageData: ImageData;
  private pixels: Uint32Array;
  private colorTable: Uint32Array;
  readonly gridWidth: number;
  readonly gridHeight: number;

  constructor(canvas: HTMLCanvasElement, gridWidth: number, gridHeight: number) {
    canvas.width = gridWidth;
    canvas.height = gridHeight;
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Failed to get 2d context");
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;

    this.imageData = this.ctx.createImageData(gridWidth, gridHeight);
    this.pixels = new Uint32Array(this.imageData.data.buffer);
    this.colorTable = this.buildColorTable();
  }

  private buildColorTable(): Uint32Array {
    const table = new Uint32Array(PARTICLE_COUNT * 256);

    for (let type = 0; type < PARTICLE_COUNT; type++) {
      const colors = PARTICLE_COLORS[type as ParticleType];
      if (!colors || colors.length === 0) continue;

      const baseOffset = type * 256;
      const numColors = colors.length;

      for (let v = 0; v < 256; v++) {
        const colorIdx = v % numColors;
        const color = colors[colorIdx];
        if (!color) continue;
        const [r, g, b] = color;
        // ABGR format for little-endian Uint32Array
        table[baseOffset + v] = (255 << 24) | (b << 16) | (g << 8) | r;
      }
    }

    return table;
  }

  render(grid: Grid): void {
    const { width, height, cells, colorVariant } = grid;
    const pixels = this.pixels;
    const colorTable = this.colorTable;

    const bg = (255 << 24) | (15 << 16) | (10 << 8) | 10;

    for (let i = 0; i < width * height; i++) {
      const type = cells[i]!;
      if (type === ParticleType.Empty) {
        pixels[i] = bg;
      } else {
        pixels[i] = colorTable[type * 256 + colorVariant[i]!]!;
      }
    }

    this.ctx.putImageData(this.imageData, 0, 0);
  }
}
