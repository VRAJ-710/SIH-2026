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
  onExit,
  onCallToAction,
}) => {
  return (
    <div
      id="guided-tour-panel"
      className="no-scrollbar"
      style={{
        position: 'absolute',
        top: 16,
        left: 428,
        zIndex: 9999,
        background: 'rgba(30, 30, 30, 0.94)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '8px',
        color: '#f3f4f6',
        width: '450px',
        maxWidth: 'calc(100vw - 450px)',
        boxShadow: '0 16px 36px rgba(0, 0, 0, 0.65)',
        fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '20px',
        overflow: 'hidden',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      {/* Top Edge Progress Bar (Task 2) */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '3px',
          background: 'rgba(255, 255, 255, 0.08)',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${((beatIndex + 1) / totalBeats) * 100}%`,
            background: '#38bdf8',
            transition: 'width 0.35s ease',
          }}
        />
      </div>

      {/* Top Clean Header Row: BEAT X OF 5, title badge, and borderless Exit X (Task 2) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '11px', color: '#9ca3af', letterSpacing: '0.04em' }}>
          <span style={{ fontWeight: 600, textTransform: 'uppercase' }}>
            Beat {beatIndex + 1} of {totalBeats}
          </span>
          <span>•</span>
          <span style={{ color: '#cbd5e1' }}>{currentBeat.badge}</span>
        </div>

        <button
          id="exit-tour-btn"
          type="button"
          onClick={onExit}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#9ca3af',
            fontSize: '14px',
            cursor: 'pointer',
            padding: '2px 4px',
            lineHeight: 1,
            transition: 'color 0.15s ease',
          }}
          title="Exit Guided Tour"
        >
          ✕
        </button>
      </div>

      {/* Title & Date Context */}
      <div>
        <h2
          id="tour-beat-title"
          style={{
            margin: '0 0 6px 0',
            fontSize: '17px',
            fontWeight: 700,
            letterSpacing: '-0.01em',
            color: '#f3f4f6',
          }}
        >
          {currentBeat.title}
        </h2>
        <div style={{ fontSize: '11px', color: '#9ca3af', display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
          <span>Date: <strong style={{ color: '#e5e7eb', fontWeight: 600 }}>{currentBeat.targetDate}</strong></span>
          <span>•</span>
          <span>Layer: <strong style={{ color: '#e5e7eb', fontWeight: 600 }}>Surface Temperature</strong></span>
        </div>
      </div>

      {/* Caption Paragraph (No inner border box, clean typography & spacing - Task 2) */}
      <div
        id="tour-beat-caption"
        style={{
          fontSize: '12.5px',
          lineHeight: 1.55,
          color: '#d1d5db',
          marginBottom: 16,
        }}
      >
        {currentBeat.caption}
      </div>

      {/* Scientific Context Callout (Unified label, subtle lighter bg, left border - Task 2) */}
      <div
        id="tour-beat-science-note"
        style={{
          background: '#28282b',
          borderLeft: '3px solid #38bdf8',
          borderRadius: '0 6px 6px 0',
          padding: '10px 14px',
          fontSize: '11px',
          lineHeight: 1.5,
          color: '#9ca3af',
          marginBottom: 16,
        }}
      >
        <strong style={{ color: '#e5e7eb', fontWeight: 600 }}>Scientific Context: </strong>
        <span style={{ color: '#cbd5e1' }}>
          {currentBeat.scienceNote.replace(/^Scientific Context:\s*/i, '')}
        </span>
      </div>

      {/* Call to Action Button if Beat provides one */}
      {currentBeat.callToAction && onCallToAction && (
        <div style={{ marginBottom: 16 }}>
          <button
            id="tour-cta-btn"
            type="button"
            onClick={() => onCallToAction(currentBeat.callToAction!.action, currentBeat.instrumentId)}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              background: 'transparent',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.18)',
              borderRadius: '5px',
              boxShadow: 'none',
              transition: 'all 0.15s ease',
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

      {/* Bottom Nav: Ghost button style for Prev/Next, subdued visible primary for Auto-Play (Task 2) */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          paddingTop: 14,
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
            fontSize: '11.5px',
            fontWeight: 500,
            cursor: beatIndex === 0 ? 'not-allowed' : 'pointer',
            opacity: beatIndex === 0 ? 0.35 : 1,
            background: 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '5px',
            color: '#d1d5db',
            transition: 'all 0.15s ease',
          }}
        >
          ⏮ Previous
        </button>

        <button
          id="tour-play-btn"
          type="button"
          onClick={onTogglePlay}
          style={{
            flex: 1.4,
            padding: '7px 12px',
            fontSize: '11.5px',
            fontWeight: 500,
            cursor: 'pointer',
            background: isPlaying ? '#28282b' : 'transparent',
            border: isPlaying ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '5px',
            color: isPlaying ? '#f87171' : '#e5e7eb',
            boxShadow: 'none',
            transition: 'all 0.15s ease',
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
            fontSize: '11.5px',
            fontWeight: 500,
            cursor: beatIndex === totalBeats - 1 ? 'not-allowed' : 'pointer',
            opacity: beatIndex === totalBeats - 1 ? 0.35 : 1,
            background: 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '5px',
            color: '#d1d5db',
            transition: 'all 0.15s ease',
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
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#38bdf8' }} />
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
