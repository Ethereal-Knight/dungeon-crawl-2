import React, { useEffect, useRef, useState } from 'react';
import type { RunState } from '@/game/events';
import type { HeroViewer } from '@/game/hero/heroModel';

/**
 * The 3D hero for the pause menu. three.js and the model builder are loaded
 * on first open so the gameplay bundle stays small. Falls back to the 2D
 * sprite when WebGL is unavailable.
 */
export function HeroModel({ run, className }: { run: RunState; className?: string }) {
  const mount = useRef<HTMLDivElement>(null);
  const viewer = useRef<HeroViewer | null>(null);
  const latest = useRef(run);
  latest.current = run;
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    let alive = true;
    import('@/game/hero/heroModel')
      .then((m) => {
        if (!alive || !mount.current) return;
        viewer.current = m.createHeroViewer(mount.current, latest.current);
        setState('ready');
      })
      .catch((err: unknown) => {
        console.error('Hero model unavailable', err);
        if (alive) setState('failed');
      });
    return () => {
      alive = false;
      viewer.current?.dispose();
      viewer.current = null;
    };
  }, []);

  useEffect(() => {
    viewer.current?.setRun(run);
  }, [run]);

  return (
    <div className={`relative ${className ?? ''}`} data-testid="hero-model" data-state={state}>
      <div ref={mount} className="absolute inset-0 overflow-hidden" />
      {state === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-white/40">Summoning Wren...</div>
      )}
      {state === 'failed' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-white/50">
          <img
            src={`${import.meta.env.BASE_URL}sprites/hero-preview.png`}
            alt="Wren"
            className="h-24 w-auto object-contain object-left [image-rendering:pixelated] opacity-90"
            style={{ clipPath: 'inset(0 calc(100% - 128px) 0 0)' }}
          />
          <span>3D view needs WebGL</span>
        </div>
      )}
    </div>
  );
}
