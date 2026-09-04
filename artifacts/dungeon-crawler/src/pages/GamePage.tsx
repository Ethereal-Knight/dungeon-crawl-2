import React, { useEffect, useRef } from 'react';
import { getGameConfig } from '@/game/GameConfig';
import { GameUI } from '@/components/GameUI';

export default function GamePage() {
  const gameRef = useRef<HTMLDivElement>(null);
  const phaserGameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!gameRef.current) return;

    // We import dynamically to avoid SSR issues if we ever had them,
    // but in Vite client-side it's fine to import directly.
    import('phaser').then((Phaser) => {
      if (!phaserGameRef.current) {
        const config = getGameConfig(gameRef.current!);
        phaserGameRef.current = new Phaser.default.Game(config);
        if (import.meta.env.DEV) {
          // Handy for poking at scenes from the browser console / tests.
          (window as unknown as { __phaserGame?: Phaser.Game }).__phaserGame =
            phaserGameRef.current;
        }
      }
    });

    return () => {
      if (phaserGameRef.current) {
        phaserGameRef.current.destroy(true);
        phaserGameRef.current = null;
        delete (window as unknown as { __phaserGame?: Phaser.Game }).__phaserGame;
      }
    };
  }, []);

  // iOS Safari ignores `user-scalable=no`, so also swallow the gestures that
  // zoom the page: pinch (gesturestart/gesturechange) and a second tap
  // landing within 300 ms of the first. Buttons use pointer events, so this
  // does not interfere with normal taps.
  useEffect(() => {
    let lastTouchEnd = 0;
    const onTouchEnd = (e: TouchEvent) => {
      const now = Date.now();
      if (now - lastTouchEnd < 300) e.preventDefault();
      lastTouchEnd = now;
    };
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener('touchend', onTouchEnd, { passive: false });
    document.addEventListener('gesturestart', prevent);
    document.addEventListener('gesturechange', prevent);
    return () => {
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('gesturestart', prevent);
      document.removeEventListener('gesturechange', prevent);
    };
  }, []);

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden select-none">
      {/* Phaser Canvas Container */}
      <div 
        ref={gameRef} 
        className="absolute inset-0 z-0 w-full h-full"
        data-testid="game-canvas-container"
      />
      
      {/* React UI Overlay */}
      <GameUI />
    </div>
  );
}
