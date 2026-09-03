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
      }
    });

    return () => {
      if (phaserGameRef.current) {
        phaserGameRef.current.destroy(true);
        phaserGameRef.current = null;
      }
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
