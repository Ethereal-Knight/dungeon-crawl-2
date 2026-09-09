import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Shield, Heart, Zap, Coins, RotateCcw, Sword, Flame, Skull, Layers, KeyRound, Share2, Pause } from 'lucide-react';
import {
  GAME_ATTACK,
  GAME_INIT,
  GAME_JOYSTICK,
  GAME_LEVEL,
  GAME_MESSAGE,
  GAME_OVER,
  GAME_PAUSE,
  GAME_RESTART,
  GAME_SHOP,
  GAME_SHOP_LEAVE,
  GAME_SPELL,
  GAME_UPDATE,
  createRunState,
  emit,
  type RunState,
  type ShopEvent,
  type ShopSession,
} from '@/game/events';
import { ShopUI } from '@/components/ShopUI';
import { PauseMenu } from '@/components/PauseMenu';

const SPELL_COST = 20;

async function captureGameImage(): Promise<File | null> {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="game-canvas-container"] canvas');
  if (!canvas) return null;

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob ? new File([blob], 'dungeon-crawl-challenge.png', { type: 'image/png' }) : null);
    }, 'image/png');
  });
}

export function GameUI() {
  const [run, setRun] = useState<RunState>(createRunState);
  const [gameOver, setGameOver] = useState(false);
  const [shop, setShop] = useState<ShopSession | null>(null);
  const shopOpen = shop !== null;
  const [banner, setBanner] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [paused, setPausedState] = useState(false);
  const isTouch = useIsTouchDevice();

  const setPaused = useCallback((next: boolean) => {
    setPausedState(next);
    emit(GAME_PAUSE, { paused: next });
  }, []);

  useEffect(() => {
    const onInit = (e: Event) => {
      setRun((e as CustomEvent<RunState>).detail);
      setGameOver(false);
      setShop(null);
      setShareStatus(null);
      setPausedState(false);
    };
    const onShop = (e: Event) => {
      const detail = (e as CustomEvent<ShopEvent>).detail;
      setRun(detail.run);
      setShop(detail.session);
    };
    const onShopLeave = () => setShop(null);
    const onUpdate = (e: Event) => setRun((e as CustomEvent<RunState>).detail);
    const onOver = () => setGameOver(true);

    let bannerTimer: number | undefined;
    const onLevel = (e: Event) => {
      const depth = (e as CustomEvent<{ depth: number }>).detail?.depth ?? 1;
      setBanner(`Depth ${depth}`);
      window.clearTimeout(bannerTimer);
      bannerTimer = window.setTimeout(() => setBanner(null), 1800);
    };

    let messageTimer: number | undefined;
    const onMessage = (e: Event) => {
      setMessage((e as CustomEvent<{ text: string }>).detail?.text ?? null);
      window.clearTimeout(messageTimer);
      messageTimer = window.setTimeout(() => setMessage(null), 2500);
    };

    window.addEventListener(GAME_INIT, onInit);
    window.addEventListener(GAME_UPDATE, onUpdate);
    window.addEventListener(GAME_OVER, onOver);
    window.addEventListener(GAME_LEVEL, onLevel);
    window.addEventListener(GAME_MESSAGE, onMessage);
    window.addEventListener(GAME_SHOP, onShop);
    window.addEventListener(GAME_SHOP_LEAVE, onShopLeave);
    return () => {
      window.removeEventListener(GAME_INIT, onInit);
      window.removeEventListener(GAME_UPDATE, onUpdate);
      window.removeEventListener(GAME_OVER, onOver);
      window.removeEventListener(GAME_LEVEL, onLevel);
      window.removeEventListener(GAME_MESSAGE, onMessage);
      window.removeEventListener(GAME_SHOP, onShop);
      window.removeEventListener(GAME_SHOP_LEAVE, onShopLeave);
      window.clearTimeout(bannerTimer);
      window.clearTimeout(messageTimer);
    };
  }, []);

  // Escape or P toggles the pause menu whenever the cave is actually running.
  const canPause = !gameOver && !shopOpen;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key.toLowerCase() !== 'p') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (paused) setPaused(false);
      else if (canPause) setPaused(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paused, canPause, setPaused]);

  const healthPct = (Math.max(0, run.health) / run.maxHealth) * 100;
  const manaPct = (Math.max(0, run.mana) / run.maxMana) * 100;
  const spellReady = run.mana >= SPELL_COST;

  const shareChallenge = async () => {
    const playUrl = `${window.location.origin}${window.location.pathname}`;
    const challengeText = [
      `I reached Depth ${run.depth} in Dungeon Crawl!`,
      `Stats: ${run.kills} kills • ${run.coins} coins • ${run.armor}/${run.maxArmor} armor.`,
      'Can you beat my run?',
    ].join('\n');
    const gameImage = await captureGameImage();
    const shareData: ShareData = {
      title: 'Dungeon Crawl Challenge',
      text: challengeText,
      url: playUrl,
    };

    if (gameImage && navigator.canShare?.({ files: [gameImage] })) {
      shareData.files = [gameImage];
    }

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setShareStatus('Challenge ready to send.');
        return;
      }

      const copyText = `${challengeText}\n${playUrl}`;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(copyText);
        setShareStatus('Challenge copied — paste it into a message.');
      } else {
        setShareStatus('Sharing is not available in this browser.');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setShareStatus('Could not open sharing. Try again.');
    }
  };

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10 select-none">
      {/* HUD: one header bar with everything on it */}
      <div className="p-2 sm:p-3">
        <div
          className="max-w-2xl flex items-center gap-1.5 sm:gap-3 bg-black/60 border border-white/10 rounded-full pl-2.5 pr-1.5 py-1 sm:py-1.5 backdrop-blur-sm text-[11px] sm:text-xs font-bold"
          data-testid="hud-bar"
        >
          <MiniBar
            icon={<Heart className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-500 fill-red-500" />}
            pct={healthPct}
            color="bg-red-500"
            label={`${Math.ceil(run.health)}`}
            title={`Health ${Math.ceil(run.health)} of ${run.maxHealth}`}
            testId="hud-health"
          />
          <MiniBar
            icon={<Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-400 fill-sky-400" />}
            pct={manaPct}
            color={spellReady ? 'bg-sky-500' : 'bg-sky-800'}
            label={`${Math.floor(run.mana)}`}
            title={`Mana ${Math.floor(run.mana)} of ${run.maxMana}`}
            testId="hud-mana"
          />
          <Chip className="text-gray-300" title={`Armor ${run.armor} of ${run.maxArmor}`} testId="hud-armor">
            <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>{run.armor}</span>
          </Chip>
          <Chip className="text-yellow-400" title={`${run.coins} coins`} testId="hud-coins">
            <Coins className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-yellow-400" />
            <span>{run.coins}</span>
          </Chip>
          <Chip className="text-amber-200" title={`Depth ${run.depth}`} testId="hud-depth">
            <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>
              <span className="hidden sm:inline">Depth </span>
              {run.depth}
            </span>
          </Chip>
          <Chip className={run.hasKey ? 'text-yellow-300' : 'text-white/25'} title={run.hasKey ? 'Carrying the gate key' : 'No key yet'} testId="hud-key">
            <KeyRound className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">{run.hasKey ? 'Key' : 'No key'}</span>
          </Chip>
          <button
            type="button"
            onClick={() => setPaused(true)}
            disabled={!canPause}
            className="pointer-events-auto ml-auto shrink-0 flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/80 transition-all active:scale-95 disabled:opacity-30"
            aria-label="Pause and show stats"
            data-testid="button-pause"
          >
            <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current" />
          </button>
        </div>
      </div>

      {paused && !gameOver && !shopOpen && <PauseMenu run={run} onResume={() => setPaused(false)} />}

      {shop && !gameOver && <ShopUI run={run} session={shop} />}

      {/* Depth banner on floor entry */}
      {banner && !gameOver && !shopOpen && !paused && (
        <div className="absolute inset-x-0 top-1/4 flex justify-center animate-in fade-in zoom-in-95 duration-300">
          <div className="text-3xl sm:text-4xl font-black tracking-widest text-amber-300 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
            {banner.toUpperCase()}
          </div>
        </div>
      )}

      {/* Transient status line */}
      {!gameOver && !shopOpen && !paused && (
        <div className="absolute top-12 sm:top-16 left-1/2 -translate-x-1/2 max-w-[92vw]">
          <div className="bg-black/40 px-4 py-1 rounded-full text-xs text-white/70 border border-white/5 backdrop-blur-sm whitespace-nowrap overflow-hidden text-ellipsis">
            {message ?? 'Find the key-bearer, unlock the gate, descend'}
          </div>
        </div>
      )}

      {/* Keyboard legend for desktop */}
      {!isTouch && !gameOver && !shopOpen && !paused && (
        <div className="absolute bottom-4 left-4 text-[11px] leading-5 text-white/50 font-mono bg-black/40 px-3 py-2 rounded-lg border border-white/5">
          <div><Key>WASD</Key> / <Key>Arrows</Key> move</div>
          <div><Key>Space</Key> sword &nbsp; <Key>F</Key> / <Key>Shift</Key> fireball</div>
          <div><Key>Esc</Key> / <Key>P</Key> pause &amp; stats</div>
        </div>
      )}

      {/* Game over */}
      {gameOver && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center pointer-events-auto z-20 backdrop-blur-sm">
          <Skull className="w-12 h-12 text-red-500 mb-2" />
          <h2 className="text-4xl font-black text-red-500 mb-4 tracking-wider">YOU DIED</h2>
          <div className="grid grid-cols-3 gap-4 text-center mb-8 text-sm">
            <Stat label="Depth" value={run.depth} />
            <Stat label="Coins" value={run.coins} />
            <Stat label="Kills" value={run.kills} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={shareChallenge}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black px-6 py-3 rounded-full font-bold transition-all active:scale-95"
              data-testid="button-share-challenge"
            >
              <Share2 className="w-5 h-5" />
              Challenge a Friend
            </button>
            <button
              onClick={() => emit(GAME_RESTART)}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-6 py-3 rounded-full font-bold transition-all active:scale-95"
              data-testid="button-restart"
            >
              <RotateCcw className="w-5 h-5" />
              Try Again
            </button>
            {shareStatus && (
              <p className="max-w-xs text-center text-xs text-white/60" aria-live="polite">
                {shareStatus}
              </p>
            )}
          </div>
          {!isTouch && <p className="mt-3 text-xs text-white/40">or press R</p>}
        </div>
      )}

      {/* Touch controls */}
      {!gameOver && !shopOpen && !paused && (
        <>
          <Joystick visible={isTouch} />
          <div className="absolute inset-0 pointer-events-none z-30">
            <div
              className="absolute right-4 sm:right-6 flex items-end gap-3"
              style={{ bottom: 'clamp(4.5rem, 12vh, 7rem)' }}
            >
              <HoldButton
                event={GAME_SPELL}
                repeatMs={380}
                disabled={!spellReady}
                className="w-20 h-20 sm:w-24 sm:h-24 border-sky-400/60 bg-sky-500/[0.12] active:bg-sky-500/[0.24] text-sky-200 mb-6"
                testId="button-spell"
                label="Cast fireball"
              >
                <Flame className="w-7 h-7" />
                <span className="text-[10px] font-bold">{SPELL_COST}</span>
              </HoldButton>
              <HoldButton
                event={GAME_ATTACK}
                repeatMs={280}
                className="w-28 h-28 sm:w-32 sm:h-32 border-red-500/60 bg-red-500/[0.12] active:bg-red-500/[0.24] text-red-200"
                testId="button-attack"
                label="Sword attack"
              >
                <Sword className="w-9 h-9" />
              </HoldButton>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---- Pieces ----------------------------------------------------------------

function MiniBar({
  icon,
  pct,
  color,
  label,
  title,
  testId,
}: {
  icon: React.ReactNode;
  pct: number;
  color: string;
  label: string;
  title: string;
  testId: string;
}) {
  return (
    <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 flex-1 basis-0" data-testid={testId} title={title} aria-label={title}>
      <span className="shrink-0">{icon}</span>
      <div className="relative min-w-6 flex-1 max-w-32 h-2 sm:h-2.5 bg-black/50 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-150`}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
      <span className="text-[10px] sm:text-[11px] text-white/70 font-mono tabular-nums w-6 sm:w-7 text-right shrink-0">{label}</span>
    </div>
  );
}

function Chip({
  children,
  className,
  title,
  testId,
}: {
  children: React.ReactNode;
  className?: string;
  title: string;
  testId?: string;
}) {
  return (
    <div
      className={`flex items-center gap-1 shrink-0 tabular-nums ${className ?? ''}`}
      data-testid={testId}
      title={title}
      aria-label={title}
    >
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white/5 rounded-lg px-4 py-2 min-w-20">
      <div className="text-white/50 text-xs uppercase tracking-wider">{label}</div>
      <div className="text-white text-xl font-bold">{value}</div>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return <span className="text-white/80 border border-white/20 rounded px-1">{children}</span>;
}

/**
 * A touch button that fires its event on press and keeps firing while held,
 * so players can mash or hold to keep swinging.
 */
function HoldButton({
  event,
  repeatMs,
  disabled,
  className,
  children,
  testId,
  label,
}: {
  event: string;
  repeatMs: number;
  disabled?: boolean;
  className: string;
  children: React.ReactNode;
  testId: string;
  label: string;
}) {
  const timer = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  const start = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    emit(event);
    stop();
    timer.current = window.setInterval(() => emit(event), repeatMs);
  };

  useEffect(() => stop, [stop]);

  return (
    <button
      type="button"
      className={`pointer-events-auto rounded-full border-2 flex flex-col items-center justify-center transition-all touch-none select-none backdrop-blur-sm active:scale-95 ${
        disabled ? 'opacity-40 saturate-50' : ''
      } ${className}`}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      onContextMenu={(e) => e.preventDefault()}
      data-testid={testId}
      aria-label={label}
    >
      {children}
    </button>
  );
}

/**
 * Dynamic thumbstick: the stick's origin is wherever the thumb first lands in
 * the lower half of the screen, so there is no fixed spot to hunt for.
 */
function Joystick({ visible }: { visible: boolean }) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const pointerId = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const [base, setBase] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const maxRadius = 44;
  const deadZone = 0.12;

  const send = (dx: number, dy: number) => {
    const dist = Math.hypot(dx, dy);
    let nx = dx / maxRadius;
    let ny = dy / maxRadius;
    if (dist / maxRadius < deadZone) {
      nx = 0;
      ny = 0;
    }
    emit(GAME_JOYSTICK, { x: nx, y: ny });
  };

  const update = (clientX: number, clientY: number) => {
    const rect = zoneRef.current?.getBoundingClientRect();
    if (!rect) return;
    let dx = clientX - rect.left - origin.current.x;
    let dy = clientY - rect.top - origin.current.y;
    const dist = Math.hypot(dx, dy);
    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }
    setStick({ x: dx, y: dy });
    send(dx, dy);
  };

  const end = () => {
    pointerId.current = null;
    setActive(false);
    setStick({ x: 0, y: 0 });
    emit(GAME_JOYSTICK, { x: 0, y: 0 });
  };

  useEffect(() => end, []);

  return (
    <div
      ref={zoneRef}
      className="absolute inset-x-0 bottom-0 h-1/2 pointer-events-auto touch-none"
      onPointerDown={(e) => {
        if (pointerId.current !== null) return;
        e.preventDefault();
        pointerId.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        const rect = e.currentTarget.getBoundingClientRect();
        origin.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        setBase(origin.current);
        setActive(true);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (pointerId.current !== e.pointerId) return;
        e.preventDefault();
        update(e.clientX, e.clientY);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      aria-label="Touch anywhere in the lower half to move"
      data-testid="joystick-zone"
    >
      {visible && (
        <div
          className={`absolute w-32 h-32 rounded-full border-2 border-white/15 bg-white/5 flex items-center justify-center pointer-events-none transition-opacity ${
            active ? 'opacity-100' : 'opacity-50'
          }`}
          style={{
            left: active ? base.x : '6.5rem',
            top: active ? base.y : 'calc(100% - 6.5rem)',
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div
            className="w-14 h-14 bg-white/25 rounded-full shadow-[0_0_18px_rgba(255,255,255,0.25)] absolute"
            style={{
              transform: `translate(${stick.x}px, ${stick.y}px)`,
              transition: active ? 'none' : 'transform 0.15s ease-out',
            }}
          />
        </div>
      )}
    </div>
  );
}

function useIsTouchDevice() {
  const [touch, setTouch] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(pointer: coarse)').matches : false,
  );
  useEffect(() => {
    const mql = window.matchMedia('(pointer: coarse)');
    const onChange = () => setTouch(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return touch;
}
