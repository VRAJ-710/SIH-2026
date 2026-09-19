import React from 'react';
import { TourBeat } from '../lib/tourScript';

interface GuidedTourPanelProps {
  currentBeat: TourBeat;
  beatIndex: number;
  totalBeats: number;
  isPlaying: boolean;
  isFlying: boolean;
  dwellRemainingSec: number;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSelectBeat: (index: number) => void;
  onExit: () => void;
  onCallToAction?: (action: 'open_3d' | 'open_profile', instrumentId?: string) => void;
}

export const GuidedTourPanel: React.FC<GuidedTourPanelProps> = ({
  currentBeat,
  beatIndex,
  totalBeats,
  isPlaying,
  isFlying,
  dwellRemainingSec,
  onTogglePlay,
  onNext,
  onPrev,
  onSelectBeat,
  onExit,
  onCallToAction,
}) => {
  return (
    <div
      id="guided-tour-panel"
      style={{
        position: 'absolute',
        top: 16,
        left: 428,
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(56, 189, 248, 0.35)',
        borderRadius: '16px',
        color: '#f8fafc',
        width: '450px',
        maxWidth: 'calc(100vw - 440px)',
        boxShadow: '0 16px 40px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '18px',
        animation: 'fadeIn 0.25s ease-out',
      }}
    >
      {/* Top Header with Beat Indicator & Exit */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
          borderBottom: '1px solid rgba(100, 116, 139, 0.25)',
          paddingBottom: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2px 8px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: 700,
              background: 'rgba(14, 165, 233, 0.2)',
              border: '1px solid #38bdf8',
              color: '#38bdf8',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            Beat {beatIndex + 1} of {totalBeats}
          </span>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#f59e0b',
              background: 'rgba(245, 158, 11, 0.15)',
              padding: '2px 7px',
              borderRadius: '6px',
              border: '1px solid rgba(245, 158, 11, 0.3)',
            }}
          >
            {currentBeat.badge}
          </span>
        </div>

        <button
          id="exit-tour-btn"
          type="button"
          onClick={onExit}
          style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '6px',
            color: '#fca5a5',
            fontSize: '11px',
            fontWeight: 600,
            padding: '3px 8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            transition: 'all 0.15s',
          }}
          title="Exit Guided Tour and return to interactive mode"
        >
          ✕ Exit Tour
        </button>
      </div>

      {/* Title & Date Context */}
      <div style={{ marginBottom: 10 }}>
        <h2
          id="tour-beat-title"
          style={{
            margin: '0 0 4px 0',
            fontSize: '16px',
            fontWeight: 700,
            letterSpacing: '0.02em',
            color: '#f8fafc',
          }}
        >
          {currentBeat.title}
        </h2>
        <div style={{ fontSize: '11.5px', color: '#94a3b8', display: 'flex', gap: 12, alignItems: 'center' }}>
          <span>📅 Date: <strong style={{ color: '#e2e8f0' }}>{currentBeat.targetDate}</strong></span>
          <span>•</span>
          <span>Layer: <strong style={{ color: '#38bdf8' }}>Surface Temperature</strong></span>
        </div>
      </div>

      {/* Stepper Dots */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {Array.from({ length: totalBeats }).map((_, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => onSelectBeat(idx)}
            style={{
              flex: 1,
              height: 5,
              borderRadius: 3,
              background: idx === beatIndex ? '#38bdf8' : idx < beatIndex ? 'rgba(56, 189, 248, 0.4)' : 'rgba(100, 116, 139, 0.3)',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: idx === beatIndex ? '0 0 8px #38bdf8' : 'none',
            }}
            title={`Jump to Beat ${idx + 1}`}
          />
        ))}
      </div>

      {/* Plain Language Caption */}
      <div
        id="tour-beat-caption"
        style={{
          background: 'rgba(30, 41, 59, 0.65)',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          borderRadius: '10px',
          padding: '12px 14px',
          fontSize: '12.5px',
          lineHeight: 1.5,
          color: '#e2e8f0',
          marginBottom: 10,
        }}
      >
        {currentBeat.caption}
      </div>

      {/* Scientific Context / Honesty Card */}
      <div
        id="tour-beat-science-note"
        style={{
          background: 'rgba(15, 23, 42, 0.75)',
          borderLeft: '3px solid #38bdf8',
          borderTop: '1px solid rgba(100, 116, 139, 0.2)',
          borderRight: '1px solid rgba(100, 116, 139, 0.2)',
          borderBottom: '1px solid rgba(100, 116, 139, 0.2)',
          borderRadius: '0 8px 8px 0',
          padding: '10px 12px',
          fontSize: '11px',
          lineHeight: 1.45,
          color: '#cbd5e1',
          marginBottom: 14,
        }}
      >
        <span style={{ fontWeight: 700, color: '#38bdf8' }}>🔬 Science Focus: </span>
        {currentBeat.scienceNote}
      </div>

      {/* Call to Action Button if Beat provides one */}
      {currentBeat.callToAction && onCallToAction && (
        <div style={{ marginBottom: 14 }}>
          <button
            id="tour-cta-btn"
            type="button"
            onClick={() => onCallToAction(currentBeat.callToAction!.action, currentBeat.instrumentId)}
            style={{
              width: '100%',
              padding: '9px 12px',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
              background: 'linear-gradient(135deg, #0284c7, #0369a1)',
              color: '#ffffff',
              border: '1px solid #38bdf8',
              borderRadius: '8px',
              boxShadow: '0 0 15px rgba(56, 189, 248, 0.4)',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <span>{currentBeat.callToAction.label}</span>
          </button>
        </div>
      )}

      {/* Controls Bar: Prev, Play/Pause, Next, Status */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          borderTop: '1px solid rgba(100, 116, 139, 0.25)',
          paddingTop: 12,
        }}
      >
        <button
          id="tour-prev-btn"
          type="button"
          onClick={onPrev}
          disabled={beatIndex === 0}
          style={{
            flex: 1,
            padding: '7px 10px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: beatIndex === 0 ? 'not-allowed' : 'pointer',
            opacity: beatIndex === 0 ? 0.4 : 1,
            background: 'rgba(30, 41, 59, 0.8)',
            border: '1px solid rgba(100, 116, 139, 0.4)',
            borderRadius: '8px',
            color: '#cbd5e1',
          }}
        >
          ⏮ Previous
        </button>

        <button
          id="tour-play-btn"
          type="button"
          onClick={onTogglePlay}
          style={{
            flex: 1.5,
            padding: '7px 12px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            background: isPlaying
              ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.35), rgba(185, 28, 28, 0.45))'
              : 'linear-gradient(135deg, rgba(14, 165, 233, 0.35), rgba(2, 132, 199, 0.45))',
            border: isPlaying ? '1px solid #f87171' : '1px solid #38bdf8',
            borderRadius: '8px',
            color: '#ffffff',
            boxShadow: isPlaying ? '0 2px 8px rgba(239, 68, 68, 0.3)' : '0 2px 8px rgba(56, 189, 248, 0.3)',
          }}
        >
          {isPlaying ? '⏸ Pause Tour' : '▶ Auto-Play Tour'}
        </button>

        <button
          id="tour-next-btn"
          type="button"
          onClick={onNext}
          disabled={beatIndex === totalBeats - 1}
          style={{
            flex: 1,
            padding: '7px 10px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: beatIndex === totalBeats - 1 ? 'not-allowed' : 'pointer',
            opacity: beatIndex === totalBeats - 1 ? 0.4 : 1,
            background: 'rgba(30, 41, 59, 0.8)',
            border: '1px solid rgba(100, 116, 139, 0.4)',
            borderRadius: '8px',
            color: '#cbd5e1',
          }}
        >
          Next ⏭
        </button>
      </div>

      {/* Auto-Play Pacing Status */}
      {isPlaying && (
        <div
          id="tour-autoplay-status"
          style={{
            marginTop: 8,
            fontSize: '10.5px',
            color: '#38bdf8',
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#38bdf8', animation: 'pulse 1.5s infinite' }} />
          {isFlying ? (
            <span>Flying camera to {currentBeat.title}...</span>
          ) : (
            <span>Arrived. Advancing in {dwellRemainingSec}s...</span>
          )}
        </div>
      )}
    </div>
  );
};

export default GuidedTourPanel;
