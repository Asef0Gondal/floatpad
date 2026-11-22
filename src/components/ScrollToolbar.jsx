import React, { useRef, useState, useEffect, useCallback } from 'react';

// A horizontally scrollable mode toolbar with explicit left/right buttons so
// mouse users (no trackpad swipe) can reach overflow tools. Buttons appear only
// when there is content to scroll toward in that direction.
export default function ScrollToolbar({ className = '', children }) {
  const ref = useRef(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 2);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [update]);

  const scroll = dir => ref.current?.scrollBy({ left: dir * 180, behavior: 'smooth' });

  return (
    <div className="toolbar-scroll">
      <div className={`mode-toolbar toolbar-scroll-inner ${className}`} ref={ref}>
        {children}
      </div>
      {canLeft && (
        <button className="toolbar-scroll-btn ts-left" onClick={() => scroll(-1)} title="Scroll tools left">‹</button>
      )}
      {canRight && (
        <button className="toolbar-scroll-btn ts-right" onClick={() => scroll(1)} title="Scroll tools right">›</button>
      )}
    </div>
  );
}