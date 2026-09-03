import React, { useState, useEffect, useRef } from 'react';
import { Shield, Heart, Zap, Coins, RotateCcw } from 'lucide-react';

export function GameUI() {
  const [health, setHealth] = useState(100);
  const [mana, setMana] = useState(100);
  const [coins, setCoins] = useState(0);
  const [armor, setArmor] = useState(20);
  const [gameOver, setGameOver] = useState(false);

  useEffect(() => {
    const handleInit = (e: any) => {
      setHealth(e.detail?.health ?? 100);
      setMana(e.detail?.mana ?? 100);
      setCoins(e.detail?.coins ?? 0);
      setArmor(e.detail?.armor ?? 20);
      setGameOver(false);
    };

    const handleUpdate = (e: any) => {
      setHealth(e.detail?.health ?? 100);
      setMana(e.detail?.mana ?? 100);
      setCoins(e.detail?.coins ?? 0);
      setArmor(e.detail?.armor ?? 20);
      
      if (e.detail?.health <= 0) {
        setGameOver(true);
      }
    };
    
    window.addEventListener('game-init', handleInit);
    window.addEventListener('game-update', handleUpdate);

    return () => {
      window.removeEventListener('game-init', handleInit);
      window.removeEventListener('game-update', handleUpdate);
    };
  }, []);

  const triggerAttack = () => {
    window.dispatchEvent(new CustomEvent('game-attack'));
  };

  const triggerRestart = () => {
    window.dispatchEvent(new CustomEvent('game-restart'));
  };

  // The joystick is a dynamic thumbstick: its origin is wherever the
  // player's first touch lands in the lower half of the screen.
  const movementZoneRef = useRef<HTMLDivElement>(null);
  const activePointerId = useRef<number | null>(null);
  const joystickOrigin = useRef({ x: 0, y: 0 });
  const [stickPos, setStickPos] = useState({ x: 0, y: 0 });
  const [stickOrigin, setStickOrigin] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const maxRadius = 40;

  const endJoystick = () => {
    activePointerId.current = null;
    setIsDragging(false);
    setStickPos({ x: 0, y: 0 });
    window.dispatchEvent(new CustomEvent('game-joystick', { detail: { x: 0, y: 0 } }));
  };

  const handlePointerStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerId.current !== null) return;

    e.preventDefault();
    activePointerId.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const localOrigin = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    joystickOrigin.current = localOrigin;
    setStickOrigin(localOrigin);
    setIsDragging(true);
    updateJoystick(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || activePointerId.current !== e.pointerId) return;
    e.preventDefault();
    updateJoystick(e.clientX, e.clientY);
  };

  const updateJoystick = (clientX: number, clientY: number) => {
    const rect = movementZoneRef.current?.getBoundingClientRect();
    if (!rect) return;

    const { x: originX, y: originY } = joystickOrigin.current;
    let dx = clientX - rect.left - originX;
    let dy = clientY - rect.top - originY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > maxRadius) {
      dx = (dx / distance) * maxRadius;
      dy = (dy / distance) * maxRadius;
    }

    setStickPos({ x: dx, y: dy });

    // Normalize for the game (-1 to 1)
    const normX = dx / maxRadius;
    const normY = dy / maxRadius;
    
    window.dispatchEvent(new CustomEvent('game-joystick', { detail: { x: normX, y: normY } }));
  };

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between overflow-hidden z-10 select-none">
      
      {/* HUD Top */}
      <div className="p-4 flex justify-between items-start">
        <div className="flex flex-col gap-2 pointer-events-auto">
          {/* Health */}
          <div className="flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded-full border border-white/10 backdrop-blur-sm">
            <Heart className="w-4 h-4 text-red-500 fill-red-500" />
            <div className="w-24 h-2 bg-black/50 rounded-full overflow-hidden">
              <div 
                className="h-full bg-red-500 transition-all duration-200" 
                style={{ width: `${Math.max(0, health)}%` }} 
              />
            </div>
          </div>
          
          {/* Mana */}
          <div className="flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded-full border border-white/10 backdrop-blur-sm">
            <Zap className="w-4 h-4 text-blue-400 fill-blue-400" />
            <div className="w-24 h-2 bg-black/50 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 transition-all duration-75" 
                style={{ width: `${Math.max(0, mana)}%` }} 
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 items-end pointer-events-auto">
          {/* Coins */}
          <div className="flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded-full border border-white/10 backdrop-blur-sm text-yellow-500 font-bold">
            <Coins className="w-4 h-4 text-yellow-500 fill-yellow-500" />
            <span>{coins}</span>
          </div>

          {/* Armor */}
          <div className="flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded-full border border-white/10 backdrop-blur-sm text-gray-400 font-bold">
            <Shield className="w-4 h-4" />
            <span>{armor}</span>
          </div>
        </div>
      </div>

      {/* Game Over Screen */}
      {gameOver && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center pointer-events-auto z-20 backdrop-blur-sm">
          <h2 className="text-4xl font-bold text-red-500 mb-2">YOU DIED</h2>
          <p className="text-gray-400 mb-6">Coins Collected: {coins}</p>
          <button 
            onClick={triggerRestart}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-6 py-3 rounded-full font-bold transition-all active:scale-95"
            data-testid="button-restart"
          >
            <RotateCcw className="w-5 h-5" />
            Try Again
          </button>
        </div>
      )}

      {/* Status Hint */}
      {!gameOver && (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 pointer-events-none">
          <div className="bg-black/40 px-4 py-1 rounded-full text-xs text-white/70 border border-white/5 backdrop-blur-sm">
            Find the hidden coins and survive
          </div>
        </div>
      )}

      {/* Full lower-half movement surface. The attack button is rendered above
          it, so a thumb landing on the button still triggers an attack. */}
      <div
        ref={movementZoneRef}
        className="absolute inset-x-0 bottom-0 h-1/2 pointer-events-auto touch-none"
        onPointerDown={handlePointerStart}
        onPointerMove={handlePointerMove}
        onPointerUp={endJoystick}
        onPointerCancel={endJoystick}
        onLostPointerCapture={endJoystick}
        aria-label="Touch anywhere in the lower half to move"
      >
        {/* Before the first touch, this is only a subtle affordance. During
            movement it relocates to the exact thumb landing position. */}
        <div 
          className={`absolute w-32 h-32 rounded-full border-2 border-white/10 bg-white/5 flex items-center justify-center pointer-events-none ${isDragging ? 'opacity-100' : 'opacity-60'}`}
          style={{
            left: isDragging ? stickOrigin.x : '8rem',
            top: isDragging ? stickOrigin.y : 'calc(100% - 7rem)',
            transform: 'translate(-50%, -50%)',
          }}
        >
          {/* Stick */}
          <div 
            className="w-12 h-12 bg-white/20 rounded-full shadow-[0_0_15px_rgba(255,255,255,0.2)] absolute"
            style={{ 
              transform: `translate(${stickPos.x}px, ${stickPos.y}px)`,
              transition: isDragging ? 'none' : 'transform 0.2s ease-out'
            }}
          />
        </div>
      </div>

      {/* Attack control sits in a dedicated layer above the full-width
          movement surface, with extra clearance for phone safe areas. */}
      <div className="absolute inset-0 pointer-events-none z-30">
        <div
          className="absolute right-6 pointer-events-auto"
          style={{ bottom: 'clamp(4.5rem, 12vh, 7rem)' }}
        >
          <button
            type="button"
            className="w-24 h-24 bg-red-500/20 active:bg-red-500/40 rounded-full border-2 border-red-500/50 flex items-center justify-center transition-colors touch-none user-select-none"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              triggerAttack();
            }}
            data-testid="button-attack"
            aria-label="Attack"
          >
            <div className="w-16 h-16 bg-red-500/30 rounded-full flex items-center justify-center pointer-events-none">
              <span className="text-red-300 font-bold">ATTACK</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
