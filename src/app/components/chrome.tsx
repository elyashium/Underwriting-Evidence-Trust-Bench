'use client';

import { useEffect, useRef } from 'react';

/**
 * The perforation between the rail and the reading column.
 *
 * It starts full-height and tears upward as the page scrolls: the line's
 * height tracks inverse scroll progress, so scrolling down pulls the tear
 * point up like opening along a dotted edge. Height (not a transform) is
 * animated so the dots stay round all the way up.
 */
export function TearDivider() {
  const line = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      if (line.current) line.current.style.height = `${100 - p * 96}%`;
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="tear" aria-hidden="true">
      <div className="tear-line" ref={line}>
        <span className="tear-tip" />
      </div>
    </div>
  );
}

const INTERACTIVE =
  'a, button, summary, input, textarea, select, .verdict span, .chip';

/**
 * A single black dot that replaces the arrow/pointer cursor on precise
 * pointers. It trails the mouse with a fast lerp and doubles in size over
 * anything clickable. Text fields keep their native I-beam — hiding the
 * caret position while someone types a review reason would be hostile.
 */
export function DotCursor() {
  const dot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    const el = dot.current;
    if (!el) return;

    document.documentElement.classList.add('cursor-on');

    let x = -100;
    let y = -100;
    let tx = -100;
    let ty = -100;
    let scale = 1;
    let targetScale = 1;
    let raf = requestAnimationFrame(loop);
    let visible = false;

    function loop() {
      x += (tx - x) * 0.4;
      y += (ty - y) * 0.4;
      scale += (targetScale - scale) * 0.25;
      el!.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale})`;
      raf = requestAnimationFrame(loop);
    }

    const move = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      if (!visible) {
        visible = true;
        el!.style.opacity = '1';
      }
    };
    const hover = (e: MouseEvent) => {
      targetScale =
        e.target instanceof Element && e.target.closest(INTERACTIVE) ? 2 : 1;
    };
    const leave = () => {
      visible = false;
      el!.style.opacity = '0';
    };

    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('mouseover', hover, { passive: true });
    document.documentElement.addEventListener('mouseleave', leave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('mouseover', hover);
      document.documentElement.removeEventListener('mouseleave', leave);
      document.documentElement.classList.remove('cursor-on');
    };
  }, []);

  return <div className="dot-cursor" ref={dot} aria-hidden="true" />;
}
