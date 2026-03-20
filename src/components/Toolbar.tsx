import { ParticleType, PARTICLE_NAMES, UI_COLORS, PLACEABLE_TYPES } from "../engine/types";

interface ToolbarProps {
  selectedMaterial: ParticleType;
  onSelectMaterial: (type: ParticleType) => void;
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
  paused: boolean;
  onTogglePause: () => void;
  onClear: () => void;
  fps: number;
}

const CATEGORIES = [
  {
    name: "SOLIDS",
    items: [
      ParticleType.Sand,
      ParticleType.Stone,
      ParticleType.Wood,
      ParticleType.Ice,
      ParticleType.Salt,
      ParticleType.Glass,
      ParticleType.Metal,
    ],
  },
  {
    name: "POWDERS",
    items: [
      ParticleType.Gunpowder,
      ParticleType.Ember,
    ],
  },
  {
    name: "LIQUIDS",
    items: [
      ParticleType.Water,
      ParticleType.Oil,
      ParticleType.Lava,
      ParticleType.Acid,
      ParticleType.Mud,
      ParticleType.Mercury,
    ],
  },
  {
    name: "GASES",
    items: [
      ParticleType.Fire,
      ParticleType.Smoke,
      ParticleType.Steam,
      ParticleType.ToxicGas,
      ParticleType.Hydrogen,
    ],
  },
  {
    name: "SPECIAL",
    items: [
      ParticleType.Plant,
      ParticleType.Fuse,
      ParticleType.Clone,
      ParticleType.Void,
    ],
  },
];

export const Toolbar = ({
  selectedMaterial,
  onSelectMaterial,
  brushSize,
  onBrushSizeChange,
  paused,
  onTogglePause,
  onClear,
  fps,
}: ToolbarProps) => {
  return (
    <div className="toolbar">
      <div className="toolbar-materials">
        {CATEGORIES.map((category, index) => (
          <div key={category.name} className="material-category-group">
            <div className="material-category">
              <div className="material-category-label">{category.name}</div>
              <div className="material-category-buttons">
                {category.items.map((type) => (
                  <button
                    key={type}
                    className={`material-btn ${selectedMaterial === type ? "selected" : ""}`}
                    style={{ backgroundColor: UI_COLORS[type] }}
                    onClick={() => onSelectMaterial(type)}
                  >
                    {PARTICLE_NAMES[type]}
                  </button>
                ))}
              </div>
            </div>
            {index < CATEGORIES.length - 1 && <div className="category-divider" />}
          </div>
        ))}
      </div>

      <div className="toolbar-controls">
        <div className="toolbar-section">
          <div className="brush-slider-container">
            <span>Size: {brushSize}</span>
            <input
              type="range"
              className="brush-slider"
              min="1"
              max="10"
              value={brushSize}
              onChange={(e) => onBrushSizeChange(parseInt(e.target.value, 10))}
            />
          </div>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-section">
          <button className="control-btn" onClick={onTogglePause}>
            {paused ? "▶ Play" : "⏸ Pause"}
          </button>
          <button className="control-btn" onClick={onClear}>
            Clear
          </button>
        </div>

        <div className="fps-counter">{fps} FPS</div>
      </div>
    </div>
  );
};
