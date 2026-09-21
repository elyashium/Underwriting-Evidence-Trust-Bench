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
 *
 * Hovering the dotted perforation swaps the dot for scissors: an invitation
 * to cut along the line. Proximity is measured against the live position of
 * `.tear`, so it survives scrolling and resizing.
 */
export function DotCursor() {
  const dot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    const el = dot.current;
    if (!el) return;

    document.documentElement.classList.add('cursor-on');

    let tearX: number | null = null;
    let tearTop = 0;
    let tearBottom = 0;
    const measureTear = () => {
      const tear = document.querySelector('.tear');
      if (!tear) {
        tearX = null;
        return;
      }
      const r = tear.getBoundingClientRect();
      if (r.width === 0) {
        // Hidden below the mobile breakpoint — no scissors there.
        tearX = null;
        return;
      }
      tearX = r.left + r.width / 2;
      tearTop = r.top - 12;
      tearBottom = r.bottom + 12;
    };
    measureTear();

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
      const nearTear =
        tearX !== null &&
        Math.abs(e.clientX - tearX) <= 14 &&
        e.clientY >= tearTop &&
        e.clientY <= tearBottom;
      el!.classList.toggle('scissors', nearTear);
      if (nearTear) targetScale = 1;
    };
    const hover = (e: MouseEvent) => {
      if (el!.classList.contains('scissors')) return;
      targetScale =
        e.target instanceof Element && e.target.closest(INTERACTIVE) ? 2 : 1;
    };
    const leave = () => {
      visible = false;
      el!.style.opacity = '0';
    };

    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('mouseover', hover, { passive: true });
    window.addEventListener('resize', measureTear);
    document.documentElement.addEventListener('mouseleave', leave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('mouseover', hover);
      window.removeEventListener('resize', measureTear);
      document.documentElement.removeEventListener('mouseleave', leave);
      document.documentElement.classList.remove('cursor-on');
    };
  }, []);

  return (
    <div className="dot-cursor" ref={dot} aria-hidden="true">
      <span className="cursor-dot" />
      <svg
        className="cursor-scissors"
        width="26"
        height="26"
        viewBox="0 0 26 26"
        fill="none"
        stroke="#16130d"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <circle cx="6.5" cy="7" r="3" />
        <circle cx="6.5" cy="19" r="3" />
        <line x1="9" y1="8.5" x2="21" y2="20" />
        <line x1="9" y1="17.5" x2="21" y2="6" />
      </svg>
    </div>
  );
}
