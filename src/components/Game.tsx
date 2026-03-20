import { useRef, useEffect, useCallback } from "react";
import { ParticleType } from "../engine/types";
import { Simulation } from "../engine/simulation";
import { Renderer } from "../engine/renderer";

const CELL_SIZE = 4;
const MIN_GRID_DIM = 50;

interface GameProps {
  selectedMaterial: ParticleType;
  brushSize: number;
  paused: boolean;
  onFpsUpdate: (fps: number) => void;
  clearRef?: React.MutableRefObject<(() => void) | null>;
}

export const Game = ({
  selectedMaterial,
  brushSize,
  paused,
  onFpsUpdate,
  clearRef,
}: GameProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simulationRef = useRef<Simulation | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const requestRef = useRef<number>(0);
  const lastFpsTimeRef = useRef<number>(0);
  const framesSinceLastFpsRef = useRef<number>(0);

  const simTimeSumRef = useRef(0);
  const renderTimeSumRef = useRef(0);
  const debugVisibleRef = useRef(false);
  const debugOverlayRef = useRef<HTMLDivElement>(null);
  const gridSizeRef = useRef({ w: 0, h: 0 });

  const stateRef = useRef({ selectedMaterial, brushSize, paused });
  useEffect(() => {
    stateRef.current = { selectedMaterial, brushSize, paused };
  }, [selectedMaterial, brushSize, paused]);

  const pointerRef = useRef({
    isDown: false,
    isRightClick: false,
    lastX: -1,
    lastY: -1,
  });

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    const initGrid = (w: number, h: number) => {
      gridSizeRef.current = { w, h };
      const sim = new Simulation(w, h);
      const renderer = new Renderer(canvas, w, h);
      simulationRef.current = sim;
      rendererRef.current = renderer;
      if (clearRef) clearRef.current = () => sim.clear();
    };

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const w = Math.max(MIN_GRID_DIM, Math.floor(width / CELL_SIZE));
      const h = Math.max(MIN_GRID_DIM, Math.floor(height / CELL_SIZE));
      const current = gridSizeRef.current;
      if (w === current.w && h === current.h) return;

      if (resizeTimer) clearTimeout(resizeTimer);
      // First observation — initialize immediately; subsequent — debounce
      if (current.w === 0) {
        initGrid(w, h);
      } else {
        resizeTimer = setTimeout(() => initGrid(w, h), 150);
      }
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
      simulationRef.current = null;
      rendererRef.current = null;
      if (clearRef) clearRef.current = null;
    };
  }, [clearRef]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "d" || e.key === "D") {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        debugVisibleRef.current = !debugVisibleRef.current;
        if (debugOverlayRef.current) {
          debugOverlayRef.current.style.display = debugVisibleRef.current ? "block" : "none";
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const loop = (time: number) => {
      if (!simulationRef.current || !rendererRef.current) {
        requestRef.current = requestAnimationFrame(loop);
        return;
      }

      const { paused, selectedMaterial, brushSize } = stateRef.current;

      const pointer = pointerRef.current;
      if (pointer.isDown && pointer.lastX >= 0 && pointer.lastY >= 0) {
        if (pointer.isRightClick) {
          simulationRef.current.erase(pointer.lastX, pointer.lastY, brushSize);
        } else {
          simulationRef.current.paint(pointer.lastX, pointer.lastY, brushSize, selectedMaterial);
        }
      }

      let simTime = 0;
      if (!paused) {
        const t0 = performance.now();
        simulationRef.current.step();
        simTime = performance.now() - t0;
      }

      const t1 = performance.now();
      rendererRef.current.render(simulationRef.current.grid);
      const renderTime = performance.now() - t1;

      simTimeSumRef.current += simTime;
      renderTimeSumRef.current += renderTime;

      framesSinceLastFpsRef.current++;
      if (time - lastFpsTimeRef.current >= 500) {
        const count = framesSinceLastFpsRef.current;
        const fps = Math.round((count * 1000) / (time - lastFpsTimeRef.current));
        onFpsUpdate(fps);

        const avgSim = count > 0 ? simTimeSumRef.current / count : 0;
        const avgRender = count > 0 ? renderTimeSumRef.current / count : 0;
        simTimeSumRef.current = 0;
        renderTimeSumRef.current = 0;

        if (debugVisibleRef.current && debugOverlayRef.current) {
          const { w, h } = gridSizeRef.current;
          debugOverlayRef.current.textContent =
            `Grid: ${w}\u00d7${h} (${(w * h).toLocaleString()} cells) | Sim: ${avgSim.toFixed(2)}ms | Render: ${avgRender.toFixed(2)}ms | FPS: ${fps}`;
        }

        framesSinceLastFpsRef.current = 0;
        lastFpsTimeRef.current = time;
      }

      requestRef.current = requestAnimationFrame(loop);
    };

    requestRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(requestRef.current);
    };
  }, [onFpsUpdate]);

  const getGridCoords = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const sim = simulationRef.current;
    if (!canvas || !sim) return { x: -1, y: -1 };

    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * sim.grid.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * sim.grid.height);
    return { x, y };
  }, []);

  const applyBrush = useCallback((x: number, y: number, isErase: boolean) => {
    const sim = simulationRef.current;
    if (!sim) return;

    const { selectedMaterial, brushSize } = stateRef.current;
    
    if (isErase) {
      sim.erase(x, y, brushSize);
    } else {
      sim.paint(x, y, brushSize, selectedMaterial);
    }
  }, []);

  // Bresenham's line algorithm for continuous drawing
  const drawLine = useCallback((x0: number, y0: number, x1: number, y1: number, isErase: boolean) => {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    let cx = x0;
    let cy = y0;

    while (true) {
      applyBrush(cx, cy, isErase);

      if (cx === x1 && cy === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        cx += sx;
      }
      if (e2 < dx) {
        err += dx;
        cy += sy;
      }
    }
  }, [applyBrush]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.setPointerCapture(e.pointerId);
    
    const isRightClick = e.button === 2 || e.buttons === 2;
    const { x, y } = getGridCoords(e);
    
    pointerRef.current = {
      isDown: true,
      isRightClick,
      lastX: x,
      lastY: y,
    };

    applyBrush(x, y, isRightClick);
  }, [getGridCoords, applyBrush]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const { isDown, isRightClick, lastX, lastY } = pointerRef.current;
    if (!isDown) return;

    const { x, y } = getGridCoords(e);
    
    if (lastX !== -1 && lastY !== -1 && (lastX !== x || lastY !== y)) {
      drawLine(lastX, lastY, x, y, isRightClick);
    } else {
      applyBrush(x, y, isRightClick);
    }

    pointerRef.current.lastX = x;
    pointerRef.current.lastY = y;
  }, [getGridCoords, drawLine, applyBrush]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.releasePointerCapture(e.pointerId);
    }
    pointerRef.current.isDown = false;
  }, []);

  const handlePointerLeave = useCallback(() => {
    pointerRef.current.isDown = false;
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div ref={containerRef} className="game-container">
      <canvas
        ref={canvasRef}
        className="game-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onContextMenu={handleContextMenu}
      />
      <div ref={debugOverlayRef} className="debug-overlay" />
    </div>
  );
};
