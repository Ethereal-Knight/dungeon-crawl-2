import React, { useEffect, useRef, useState } from 'react';
import type { RunState } from '@/game/events';
import type { HeroViewer } from '@/game/hero/heroModel';
import { armorAt, weaponAt, UPGRADE_IDS, UPGRADES } from '@/game/shop';

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
  const weapon = weaponAt(run.weapon);
  const armor = armorAt(run.armorTier);
  const upgrades = UPGRADE_IDS.filter((id) => run.upgrades[id] > 0)
    .map((id) => `${UPGRADES[id].name} ${run.upgrades[id]}`);

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
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#09080b] via-[#09080b]/85 to-transparent px-5 pb-5 pt-12">
        <p className="text-[10px] uppercase tracking-[0.25em] text-[#c9a84c]">Equipped appearance</p>
        <p className="mt-1 text-sm text-[#e8dcc0]" data-testid="hero-equipment">
          {armor.name} <span aria-hidden="true">·</span> {weapon.name}
        </p>
        <p className="sr-only">
          {upgrades.length ? `Visible enchantments: ${upgrades.join(', ')}.` : 'No upgrade charms equipped.'}
        </p>
      </div>
      {state === 'loading' && (
        <div role="status" className="absolute inset-0 flex items-center justify-center text-xs text-white/40">Summoning Wren...</div>
      )}
      {state === 'failed' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-white/50">
          <div
            role="img"
            aria-label="Wren, sprite preview"
            className="h-32 w-32 [image-rendering:pixelated] opacity-90"
            style={{
              backgroundImage: `url(${import.meta.env.BASE_URL}sprites/hero-preview.png)`,
              backgroundPosition: '0 0',
              backgroundRepeat: 'no-repeat',
            }}
          />
          <span>3D view needs WebGL</span>
        </div>
      )}
    </div>
  );
}
