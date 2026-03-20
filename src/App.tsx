import { useState, useRef, useCallback } from "react";
import { ParticleType } from "./engine/types";
import { Game } from "./components/Game";
import { Toolbar } from "./components/Toolbar";
import "./index.css";

export function App() {
  const [selectedMaterial, setSelectedMaterial] = useState<ParticleType>(ParticleType.Sand);
  const [brushSize, setBrushSize] = useState<number>(3);
  const [paused, setPaused] = useState<boolean>(false);
  const [fps, setFps] = useState<number>(0);

  const clearRef = useRef<(() => void) | null>(null);

  const handleClear = useCallback(() => {
    if (clearRef.current) {
      clearRef.current();
    }
  }, []);

  const handleTogglePause = useCallback(() => {
    setPaused((prev) => !prev);
  }, []);

  return (
    <div className="app">
      <Toolbar
        selectedMaterial={selectedMaterial}
        onSelectMaterial={setSelectedMaterial}
        brushSize={brushSize}
        onBrushSizeChange={setBrushSize}
        paused={paused}
        onTogglePause={handleTogglePause}
        onClear={handleClear}
        fps={fps}
      />
      <Game
        selectedMaterial={selectedMaterial}
        brushSize={brushSize}
        paused={paused}
        onFpsUpdate={setFps}
        clearRef={clearRef}
      />
    </div>
  );
}

export default App;
