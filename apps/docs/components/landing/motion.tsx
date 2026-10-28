'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

// Whether an element has come into view, once. With reduced motion it counts
// as in view from the start, so nothing waits to appear.
export function useInView<T extends Element>(margin = '0px 0px -12% 0px') {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: margin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [margin]);
  return { ref, inView };
}

// Fades its content up the first time it scrolls into view.
export function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div ref={ref} data-reveal="" data-shown={inView || undefined} style={{ transitionDelay: `${delay}ms` }} className={className}>
      {children}
    </div>
  );
}

// A counter that steps through `length` phases every `ms` while `running`,
// and rests on the last one under reduced motion.
export function usePhase(length: number, ms: number, running: boolean) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (!running) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPhase(length - 1);
      return;
    }
    const timer = setInterval(() => setPhase((p) => (p + 1) % length), ms);
    return () => clearInterval(timer);
  }, [length, ms, running]);
  return phase;
}
