import React from 'react';
import {
  Coins,
  ArrowDownToLine,
  Sword,
  Shield,
  Wrench,
  Heart,
  Zap,
  Target,
  Clover,
  Dumbbell,
} from 'lucide-react';
import { GAME_BUY, GAME_SHOP_LEAVE, emit, type RunState, type ShopSession } from '@/game/events';
import { getOffers, isShopItemId, type Offer, type ShopItemId } from '@/game/shop';

const ICONS: Record<ShopItemId, React.ReactNode> = {
  weapon: <Sword className="w-5 h-5" />,
  armor: <Shield className="w-5 h-5" />,
  repair: <Wrench className="w-5 h-5" />,
  vitality: <Heart className="w-5 h-5" />,
  focus: <Zap className="w-5 h-5" />,
  reach: <Target className="w-5 h-5" />,
  luck: <Clover className="w-5 h-5" />,
  strength: <Dumbbell className="w-5 h-5" />,
};

const ACCENT: Record<ShopItemId, string> = {
  weapon: 'text-orange-300',
  armor: 'text-slate-300',
  repair: 'text-slate-400',
  vitality: 'text-red-400',
  focus: 'text-sky-400',
  reach: 'text-violet-300',
  luck: 'text-emerald-400',
  strength: 'text-amber-400',
};

/**
 * A shop screen. Between floors the merchant stocks three random items; the
 * wandering merchant found in deeper caves stocks two. Phaser owns the coins
 * and applies purchases; this screen only renders offers and dispatches
 * intents.
 */
export function ShopUI({ run, session }: { run: RunState; session: ShopSession }) {
  const ids = session.offers.filter(isShopItemId);
  const offers = getOffers(run, ids);
  const nextDepth = run.depth + 1;
  const isFloor = session.kind === 'floor';

  return (
    <div
      className="absolute inset-0 bg-black/85 backdrop-blur-sm pointer-events-auto z-40 flex flex-col"
      data-testid="shop"
      data-shop-kind={session.kind}
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-2 sm:px-8 sm:pt-6">
        <div>
          <div className="text-amber-300 text-xs uppercase tracking-[0.3em]">
            {isFloor ? 'Merchant' : 'Wandering Merchant'}
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            {isFloor ? `Rest before depth ${nextDepth}` : 'A stall in the dark'}
          </h2>
          <p className="text-white/50 text-xs sm:text-sm mt-1">
            {isFloor
              ? 'Only three wares tonight. Enemies below hit harder and move faster.'
              : 'Two wares, take them or leave them. He will not be here on the next floor.'}
          </p>
        </div>
        <div
          className="flex items-center gap-2 bg-black/60 px-4 py-2 rounded-full border border-yellow-500/30 text-yellow-400 font-bold text-lg"
          data-testid="shop-coins"
        >
          <Coins className="w-5 h-5 fill-yellow-400" />
          {run.coins}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-8 pb-4 overscroll-contain" style={{ touchAction: 'pan-y' }}>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl mx-auto">
          {offers.map((offer) => (
            <OfferCard key={offer.id} offer={offer} />
          ))}
        </div>
      </div>

      <div className="p-4 sm:p-6 border-t border-white/10 bg-black/40 flex justify-center">
        <button
          type="button"
          onClick={() => emit(GAME_SHOP_LEAVE)}
          className="flex items-center gap-3 bg-amber-500 hover:bg-amber-400 text-black px-8 py-4 rounded-full font-black text-lg transition-all active:scale-95 shadow-[0_0_30px_rgba(245,158,11,0.35)]"
          data-testid="button-descend"
        >
          <ArrowDownToLine className="w-6 h-6" />
          {isFloor ? `Descend to depth ${nextDepth}` : 'Back to the cave'}
        </button>
      </div>
    </div>
  );
}

function OfferCard({ offer }: { offer: Offer }) {
  const canBuy = !offer.maxed && offer.affordable;
  return (
    <div
      className={`rounded-2xl border p-4 flex flex-col gap-2 transition-colors ${
        offer.maxed
          ? 'border-white/5 bg-white/[0.03]'
          : canBuy
            ? 'border-amber-400/40 bg-white/[0.06]'
            : 'border-white/10 bg-white/[0.04]'
      }`}
      data-testid={`offer-${offer.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={`flex items-center gap-2 font-bold ${ACCENT[offer.id]}`}>
          {ICONS[offer.id]}
          <span className="text-white">{offer.name}</span>
        </div>
        {offer.id !== 'repair' && <LevelBadge level={offer.level} gear={offer.id === 'weapon' || offer.id === 'armor'} />}
      </div>
      <p className="text-xs text-white/50 leading-snug">{offer.description}</p>
      <p className="text-sm text-white/85 leading-snug">{offer.effect}</p>
      <button
        type="button"
        disabled={!canBuy}
        onClick={() => emit(GAME_BUY, { id: offer.id })}
        className={`mt-auto flex items-center justify-center gap-2 rounded-full px-4 py-3 font-bold text-sm transition-all active:scale-95 disabled:active:scale-100 ${
          offer.maxed
            ? 'bg-white/5 text-white/40'
            : canBuy
              ? 'bg-amber-500 text-black hover:bg-amber-400'
              : 'bg-white/10 text-white/40'
        }`}
        data-testid={`buy-${offer.id}`}
      >
        {offer.maxed ? (
          'Full'
        ) : (
          <>
            <Coins className="w-4 h-4" />
            {offer.price}
          </>
        )}
      </button>
    </div>
  );
}

function LevelBadge({ level, gear }: { level: number; gear: boolean }) {
  return (
    <span
      className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-amber-300/90 bg-amber-400/10 border border-amber-400/20 rounded-full px-2 py-0.5"
      aria-label={gear ? `Tier ${level}` : `Level ${level}`}
    >
      {gear ? `Tier ${level}` : `Lv ${level}`}
    </span>
  );
}
