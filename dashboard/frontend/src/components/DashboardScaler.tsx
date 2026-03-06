import { useRef, useState, useEffect, useCallback } from 'react';

interface DashboardScalerProps {
  designWidth: number;
  designHeight: number;
  children: React.ReactNode;
}

/**
 * Wraps a dashboard and scales it to fit the viewport while preserving
 * the exact internal layout. The dashboard is rendered at its design
 * dimensions and a single CSS transform: scale() is applied so it
 * fills the available space without scrollbars or layout changes.
 */
export function DashboardScaler({
  designWidth,
  designHeight,
  children,
}: DashboardScalerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const recalculate = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const vw = wrapper.clientWidth;
    const vh = wrapper.clientHeight;

    setScale(Math.min(vw / designWidth, vh / designHeight));
  }, [designWidth, designHeight]);

  useEffect(() => {
    recalculate();
    const observer = new ResizeObserver(recalculate);
    if (wrapperRef.current) observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, [recalculate]);

  return (
    <div
      ref={wrapperRef}
      style={{
        width: '100%',
        height: '100vh',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#050505',
      }}
    >
      <div
        style={{
          width: designWidth,
          height: designHeight,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          flexShrink: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}
