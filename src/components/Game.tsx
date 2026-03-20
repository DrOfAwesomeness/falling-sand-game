import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import { ParticleType } from "../engine/types";
import { Simulation } from "../engine/simulation";
import { Renderer } from "../engine/renderer";

const GRID_W = 200;
const GRID_H = 150;

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simulationRef = useRef<Simulation | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const requestRef = useRef<number>(0);
  const lastFpsTimeRef = useRef<number>(0);
  const framesSinceLastFpsRef = useRef<number>(0);
  
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
    if (!canvasRef.current || simulationRef.current) return;

    const canvas = canvasRef.current;
    canvas.style.imageRendering = "pixelated";

    const sim = new Simulation(GRID_W, GRID_H);
    const renderer = new Renderer(canvas, GRID_W, GRID_H);

    simulationRef.current = sim;
    rendererRef.current = renderer;

    if (clearRef) {
      clearRef.current = () => sim.clear();
    }

    return () => {
      if (clearRef) clearRef.current = null;
      simulationRef.current = null;
      rendererRef.current = null;
    };
  }, [clearRef]);

  useEffect(() => {
    const loop = (time: number) => {
      if (!simulationRef.current || !rendererRef.current) return;

      const { paused, selectedMaterial, brushSize } = stateRef.current;

      const pointer = pointerRef.current;
      if (pointer.isDown && pointer.lastX >= 0 && pointer.lastY >= 0) {
        if (pointer.isRightClick) {
          simulationRef.current.erase(pointer.lastX, pointer.lastY, brushSize);
        } else {
          simulationRef.current.paint(pointer.lastX, pointer.lastY, brushSize, selectedMaterial);
        }
      }

      if (!paused) {
        simulationRef.current.step();
      }

      rendererRef.current.render(simulationRef.current.grid);

      framesSinceLastFpsRef.current++;
      if (time - lastFpsTimeRef.current >= 500) {
        const fps = Math.round((framesSinceLastFpsRef.current * 1000) / (time - lastFpsTimeRef.current));
        onFpsUpdate(fps);
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
    if (!canvas) return { x: -1, y: -1 };

    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * GRID_W);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * GRID_H);
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
    <div className="game-container">
      <canvas
        ref={canvasRef}
        className="game-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onContextMenu={handleContextMenu}
      />
    </div>
  );
};
