'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';

/**
 * A scene (Stage 3.5): one section of a page, one idea, one entrance.
 *
 * The scene watches itself with an IntersectionObserver and, the first time
 * enough of it is on screen, marks itself `data-inview`. Every `enter-*`
 * animation inside it is held on its first frame until then (see
 * `app/globals.css`), and plays exactly once. The observer disconnects after
 * that — a scene that re-animated every time it scrolled past would be a
 * screensaver.
 *
 * The context tells JavaScript-driven motion (the counters) the same thing.
 */

const SceneContext = createContext<boolean>(true);

/**
 * Whether the enclosing scene has been seen. Outside any scene this is always
 * `true`, so a counter that is not part of a sequence behaves as it always did.
 */
export function useSceneInView(): boolean {
  return useContext(SceneContext);
}

export interface SceneProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

export function Scene({ children, className, ...props }: SceneProps) {
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (node === null) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      // Plays once the scene's top has cleared the bottom 15% of the screen.
      // A share-of-the-scene threshold would never trip on a scene taller
      // than the viewport.
      { rootMargin: '0px 0px -15% 0px' },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <SceneContext.Provider value={inView}>
      <section
        ref={ref}
        data-inview={inView ? '' : undefined}
        className={cn('scene', className)}
        {...props}
      >
        {children}
      </section>
    </SceneContext.Provider>
  );
}
