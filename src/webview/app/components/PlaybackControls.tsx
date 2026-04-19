import React from 'react';

interface PlaybackControlsProps {
  isPlaying: boolean;
  currentStep: number;
  totalSteps: number;
  speed: number;
  zoom: number;
  onPlay: () => void;
  onPause: () => void;
  onStepForward: () => void;
  onStepBackward: () => void;
  onReset: () => void;
  onSpeedChange: (speed: number) => void;
  onZoomChange: (zoom: number) => void;
  onStepChange: (step: number) => void;
  disabled: boolean;
}

export function PlaybackControls(props: PlaybackControlsProps) {
  const {
    isPlaying, currentStep, totalSteps, speed, zoom,
    onPlay, onPause, onStepForward, onStepBackward, onReset,
    onSpeedChange, onZoomChange, onStepChange, disabled,
  } = props;

  return (
    <div style={styles.bar}>
      {/* Navigation buttons */}
      <div style={styles.group}>
        <button style={styles.btn} onClick={onReset} disabled={disabled} title="Reset">
          ⏮
        </button>
        <button style={styles.btn} onClick={onStepBackward} disabled={disabled || currentStep <= 0} title="Step Back">
          ⏪
        </button>
        {isPlaying ? (
          <button style={{ ...styles.btn, ...styles.playBtn }} onClick={onPause} disabled={disabled} title="Pause">
            ⏸
          </button>
        ) : (
          <button style={{ ...styles.btn, ...styles.playBtn }} onClick={onPlay} disabled={disabled || currentStep >= totalSteps - 1} title="Play">
            ▶
          </button>
        )}
        <button style={styles.btn} onClick={onStepForward} disabled={disabled || currentStep >= totalSteps - 1} title="Step Forward">
          ⏩
        </button>
      </div>

      {/* Progress slider */}
      <div style={styles.group}>
        <input
          type="range"
          min={0}
          max={Math.max(totalSteps - 1, 0)}
          value={currentStep}
          onChange={(e) => onStepChange(parseInt(e.target.value, 10))}
          disabled={disabled}
          style={styles.slider}
          title={`Step ${currentStep + 1} / ${totalSteps}`}
        />
      </div>

      {/* Speed control */}
      <div style={styles.group}>
        <label style={styles.label}>Speed</label>
        <input
          type="range"
          min={0.1}
          max={5}
          step={0.1}
          value={speed}
          onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
          style={styles.miniSlider}
          title={`Speed: ${speed.toFixed(1)}x`}
        />
        <span style={styles.value}>{speed.toFixed(1)}x</span>
      </div>

      {/* Zoom control */}
      <div style={styles.group}>
        <label style={styles.label}>Zoom</label>
        <input
          type="range"
          min={0.25}
          max={3}
          step={0.05}
          value={zoom}
          onChange={(e) => onZoomChange(parseFloat(e.target.value))}
          style={styles.miniSlider}
          title={`Zoom: ${(zoom * 100).toFixed(0)}%`}
        />
        <span style={styles.value}>{(zoom * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '8px 16px',
    borderTop: '1px solid var(--vscode-panel-border)',
    background: 'var(--vscode-editor-background)',
    flexShrink: 0,
    flexWrap: 'wrap',
  },
  group: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  btn: {
    background: 'transparent',
    border: '1px solid var(--vscode-button-border, transparent)',
    color: 'var(--vscode-button-foreground)',
    cursor: 'pointer',
    fontSize: 14,
    padding: '4px 8px',
    borderRadius: 3,
    lineHeight: 1,
  },
  playBtn: {
    background: 'var(--vscode-button-background)',
    fontSize: 16,
    padding: '4px 12px',
  },
  slider: {
    width: 120,
    accentColor: 'var(--vscode-focusBorder)',
  },
  miniSlider: {
    width: 70,
    accentColor: 'var(--vscode-focusBorder)',
  },
  label: {
    fontSize: 11,
    opacity: 0.7,
    marginRight: 4,
  },
  value: {
    fontSize: 11,
    opacity: 0.8,
    minWidth: 30,
    textAlign: 'right' as const,
  },
};
