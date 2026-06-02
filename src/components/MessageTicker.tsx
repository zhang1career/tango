/**
 * 游戏标题区消息滚动 - 统一从右进、从左出，CSS transform 匀速滚动
 */

import React, {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';

const PX_PER_SEC = 36;
const MESSAGE_GAP_MS = 900;
const MIN_DURATION_MS = 1800;

interface ScrollSpec {
  startX: number;
  endX: number;
  durationMs: number;
}

interface MessageTickerProps {
  messages: string[];
}

export function MessageTicker({messages}: MessageTickerProps) {
  const [index, setIndex] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [scrollSpec, setScrollSpec] = useState<ScrollSpec | null>(null);
  const gapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAdvanceRef = useRef(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  const text = messages.length > 0 ? messages[index % messages.length] : '';
  const animKey = `${index}-${cycle}-${text}`;
  const messagesKey = messages.join('\0');

  const clearGapTimer = useCallback(() => {
    if (gapTimerRef.current) {
      clearTimeout(gapTimerRef.current);
      gapTimerRef.current = null;
    }
  }, []);

  const advance = useCallback(() => {
    if (messages.length <= 1) {
      setCycle((c) => c + 1);
      return;
    }
    setIndex((i) => (i + 1) % messages.length);
  }, [messages.length]);

  const runAdvance = useCallback(() => {
    pendingAdvanceRef.current = false;
    clearGapTimer();
    textRef.current && (textRef.current.style.willChange = 'auto');
    advance();
  }, [advance, clearGapTimer]);

  const scheduleAdvance = useCallback(() => {
    clearGapTimer();
    if (document.hidden) {
      pendingAdvanceRef.current = true;
      return;
    }
    gapTimerRef.current = setTimeout(runAdvance, MESSAGE_GAP_MS);
  }, [clearGapTimer, runAdvance]);

  useEffect(() => {
    setIndex(0);
    setCycle(0);
    pendingAdvanceRef.current = false;
    clearGapTimer();
  }, [messagesKey, clearGapTimer]);

  useEffect(() => () => clearGapTimer(), [clearGapTimer]);

  useLayoutEffect(() => {
    setScrollSpec(null);
    const trackEl = trackRef.current;
    const textEl = textRef.current;
    if (!text || !trackEl || !textEl) return;

    const textW = textEl.scrollWidth;
    const trackW = trackEl.clientWidth;
    const startX = trackW;
    const endX = -textW;
    const distance = startX - endX;
    const durationMs = Math.max(MIN_DURATION_MS, (distance / PX_PER_SEC) * 1000);

    textEl.style.willChange = 'auto';
    textEl.style.transform = `translateX(${startX}px)`;
    setScrollSpec({startX, endX, durationMs});
  }, [text, animKey]);

  useEffect(() => {
    const textEl = textRef.current;
    if (!textEl) return;

    const syncVisibility = () => {
      textEl.style.animationPlayState = document.hidden ? 'paused' : 'running';
      if (document.hidden) return;
      if (pendingAdvanceRef.current) {
        scheduleAdvance();
      }
    };

    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);
    return () => document.removeEventListener('visibilitychange', syncVisibility);
  }, [animKey, scrollSpec, scheduleAdvance]);

  const handleAnimationStart = useCallback(() => {
    if (textRef.current) textRef.current.style.willChange = 'transform';
  }, []);

  const handleAnimationEnd = useCallback(() => {
    if (textRef.current) textRef.current.style.willChange = 'auto';
    scheduleAdvance();
  }, [scheduleAdvance]);

  useEffect(() => {
    if (!text || !scrollSpec) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!mq.matches) return;
    const timer = setTimeout(scheduleAdvance, scrollSpec.durationMs);
    return () => clearTimeout(timer);
  }, [text, animKey, scrollSpec, scheduleAdvance]);

  if (!text) {
    return (
      <div style={styles.wrap} aria-live="polite">
        <span style={styles.empty}>当前无消息</span>
      </div>
    );
  }

  return (
    <div style={styles.wrap} aria-live="polite">
      <style>{`
        @keyframes message-ticker-scroll {
          from { transform: translateX(var(--ticker-start)); }
          to { transform: translateX(var(--ticker-end)); }
        }
        @media (prefers-reduced-motion: reduce) {
          .message-ticker-text {
            transform: translateX(0) !important;
            animation: none !important;
          }
        }
      `}</style>
      <div ref={trackRef} style={styles.track}>
        <span
          key={animKey}
          ref={textRef}
          className="message-ticker-text"
          style={{
            ...styles.text,
            ...(scrollSpec
              ? {
                  ['--ticker-start' as string]: `${scrollSpec.startX}px`,
                  ['--ticker-end' as string]: `${scrollSpec.endX}px`,
                  animation: `message-ticker-scroll ${scrollSpec.durationMs}ms linear forwards`,
                }
              : {
                  visibility: 'hidden' as const,
                }),
          }}
          onAnimationStart={scrollSpec ? handleAnimationStart : undefined}
          onAnimationEnd={scrollSpec ? handleAnimationEnd : undefined}
        >
          {text}
        </span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    flex: 1,
    maxWidth: 420,
    minWidth: 160,
    height: 22,
    borderRadius: 999,
    backgroundColor: '#24243c',
    padding: '0 10px',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
  },
  track: {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  text: {
    position: 'absolute',
    left: 0,
    top: 0,
    whiteSpace: 'nowrap',
    color: '#c7c7ef',
    fontSize: 12,
    lineHeight: '22px',
  },
  empty: {
    color: '#7f7faa',
    fontSize: 12,
    lineHeight: '22px',
  },
};
