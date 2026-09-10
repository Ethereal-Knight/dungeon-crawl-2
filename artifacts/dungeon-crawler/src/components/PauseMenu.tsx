import React from 'react';
import {
  Play,
  RotateCcw,
  Heart,
  Zap,
  Shield,
  Coins,
  Layers,
  Skull,
  KeyRound,
  Sword,
  Flame,
  Target,
  Clover,
  Dumbbell,
  Sparkles,
  Swords,
} from 'lucide-react';
import { GAME_RESTART, emit, type RunState } from '@/game/events';
import { armorAt, derive, UPGRADE_IDS, UPGRADES, weaponAt, type UpgradeId } from '@/game/shop';
import { SPELL_COST, SPELL_SPEED } from '@/game/Player';
import { TILE } from '@/game/textures';
import { HeroModel } from '@/components/HeroModel';

const GOLD = '#c9a84c';
const DISPLAY_FONT = "'Cinzel', 'Trajan Pro', Georgia, 'Times New Roman', serif";

const UPGRADE_ICONS: Record<UpgradeId, React.ReactNode> = {
  vitality: <Heart className="w-5 h-5" />,
  focus: <Zap className="w-5 h-5" />,
  reach: <Target className="w-5 h-5" />,
  luck: <Clover className="w-5 h-5" />,
  strength: <Dumbbell className="w-5 h-5" />,
};

/** What each upgrade adds to the hero model, so players know what to look for. */
const UPGRADE_LOOK: Record<UpgradeId, string> = {
  vitality: 'Heart amulet',
  focus: 'Mana crystals',
  reach: 'Gold circlet',
  luck: 'Clover charms',
  strength: 'Arm bands',
};

/**
 * Pause screen styled as a character sheet: the hero stands in a torchlit
 * corridor on one side, the parchment-and-gold stat sheet on the other.
 * Resume goes back to the cave exactly as it was.
 */
export function PauseMenu({ run, onResume }: { run: RunState; onResume: () => void }) {
  const stats = derive(run);
  const weapon = weaponAt(run.weapon);
  const armor = armorAt(run.armorTier);
  const spellTiles = ((stats.spellLifetime / 1000) * SPELL_SPEED) / TILE;
  const swordTiles = stats.swordRange / TILE;
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div
      className="absolute inset-0 pointer-events-auto z-40 flex flex-col text-[#e8dcc0]"
      style={{
        background:
          'radial-gradient(120% 90% at 50% 0%, rgba(60,45,25,0.35) 0%, rgba(8,7,10,0) 55%), radial-gradient(80% 60% at 50% 100%, rgba(120,70,20,0.18) 0%, rgba(8,7,10,0) 60%), #09080b',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
      data-testid="pause-menu"
    >
      {/* Gold frame */}
      <div className="pointer-events-none absolute inset-2 sm:inset-3 border border-[#c9a84c]/45 rounded-sm" />
      <div className="pointer-events-none absolute inset-3 sm:inset-4 border border-[#c9a84c]/20 rounded-sm" />
      <Corner className="top-2 left-2 sm:top-3 sm:left-3" />
      <Corner className="top-2 right-2 sm:top-3 sm:right-3 -scale-x-100" />
      <Corner className="bottom-2 left-2 sm:bottom-3 sm:left-3 -scale-y-100" />
      <Corner className="bottom-2 right-2 sm:bottom-3 sm:right-3 -scale-100" />

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-8 py-6 sm:py-8" style={{ touchAction: 'pan-y' }}>
        <div className="max-w-6xl mx-auto grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,10fr)_minmax(0,9fr)] lg:gap-10 lg:min-h-full">
          {/* Hero stage: first on phones so the model is the opening shot */}
          <section className="order-1 lg:order-2 min-w-0 flex flex-col">
            <HeroModel
              run={run}
              className="h-[58vh] min-h-[22rem] lg:h-full lg:min-h-[34rem] rounded-sm overflow-hidden border border-[#c9a84c]/25 shadow-[inset_0_0_80px_rgba(0,0,0,0.7)]"
            />
            <p className="mt-2 text-[10px] uppercase tracking-[0.3em] text-[#c9a84c]/60 text-center" style={{ fontFamily: DISPLAY_FONT }}>
              Drag to turn · gear changes as you upgrade
            </p>
          </section>

          {/* Character sheet */}
          <section className="order-2 lg:order-1 min-w-0 flex flex-col gap-6">
            <header>
              <div className="flex items-start gap-4">
                <Emblem />
                <div className="min-w-0">
                  <h2
                    className="text-[26px] sm:text-4xl leading-none tracking-[0.06em] text-[#e8dcc0]"
                    style={{ fontFamily: DISPLAY_FONT, fontWeight: 700, textShadow: '0 2px 12px rgba(0,0,0,0.8)' }}
                  >
                    DUNGEON CRAWLER
                  </h2>
                  <div className="mt-2 flex items-center gap-2 text-[#c9a84c]" style={{ fontFamily: DISPLAY_FONT }}>
                    <span className="hidden sm:block h-px w-10 bg-[#c9a84c]/70" />
                    <span className="whitespace-nowrap text-[10px] sm:text-sm tracking-[0.22em] sm:tracking-[0.35em] uppercase">Wren · Hero of the Depths</span>
                    <span className="hidden sm:block h-px w-10 bg-[#c9a84c]/70" />
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm sm:text-[15px] leading-relaxed text-[#e8dcc0]/80 max-w-md" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
                A hooded ranger-mage of the deep caves, tempered by fire and shadow. You descend for silver, gems and
                the key to every locked gate, and you do not come back up.
              </p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] sm:text-xs tracking-[0.2em] uppercase text-[#c9a84c]" style={{ fontFamily: DISPLAY_FONT }}>
                <span className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> Depth {run.depth}</span>
                <span className="flex items-center gap-1.5"><Coins className="w-3.5 h-3.5" /> {run.coins} coins</span>
                <span className="flex items-center gap-1.5"><Skull className="w-3.5 h-3.5" /> {run.kills} kills</span>
                <span className={`flex items-center gap-1.5 ${run.hasKey ? '' : 'opacity-50'}`}><KeyRound className="w-3.5 h-3.5" /> {run.hasKey ? 'Key carried' : 'No key'}</span>
              </div>
            </header>

            {/* Stats */}
            <div>
              <Heading>Stats</Heading>
              <div className="mt-3 flex flex-col gap-2.5">
                <StatBar icon={<Heart className="w-5 h-5" />} label="Health" fill={run.health / run.maxHealth} value={`${Math.ceil(run.health)}/${run.maxHealth}`} testId="pause-health" />
                <StatBar icon={<Zap className="w-5 h-5" />} label="Mana" fill={run.mana / run.maxMana} value={`${Math.floor(run.mana)}/${run.maxMana}`} testId="pause-mana" />
                <StatBar icon={<Shield className="w-5 h-5" />} label="Armor" fill={run.maxArmor ? run.armor / run.maxArmor : 0} value={`${run.armor}/${run.maxArmor}`} />
                <StatBar icon={<Sword className="w-5 h-5" />} label="Might" fill={stats.swordDamage / 120} value={`${stats.swordDamage}`} testId="pause-sword-damage" />
                <StatBar icon={<Flame className="w-5 h-5" />} label="Arcana" fill={stats.spellDamage / 100} value={`${stats.spellDamage}`} />
                <StatBar icon={<Sparkles className="w-5 h-5" />} label="Fortune" fill={stats.goldChance / 0.6} value={pct(stats.goldChance)} />
              </div>
            </div>

            {/* Abilities */}
            <div>
              <Heading>Abilities</Heading>
              <ul className="mt-3 flex flex-col gap-3">
                <Ability
                  icon={<Swords className="w-5 h-5" />}
                  name="Cleave"
                  text={`Sweep a wide arc for ${stats.swordDamage} damage, ${swordTiles.toFixed(1)} tiles of reach, every ${stats.swordCooldown} ms.`}
                />
                <Ability
                  icon={<Flame className="w-5 h-5" />}
                  name="Fireball"
                  text={`Hurl a blast for ${stats.spellDamage} damage up to ${spellTiles.toFixed(1)} tiles. Costs ${SPELL_COST} mana; ${stats.manaRegen} returns each second.`}
                />
                <Ability
                  icon={<KeyRound className="w-5 h-5" />}
                  name="Keybearer"
                  text={`Slay the enemy carrying the key, unlock the gate and descend. ${run.hasKey ? 'The key is in your hand.' : 'The key is still out there.'}`}
                />
              </ul>
            </div>

            {/* Gear and charms */}
            <div>
              <Heading>Gear &amp; Charms</Heading>
              <div className="mt-3 grid grid-cols-4 sm:grid-cols-7 gap-2" data-testid="pause-upgrades">
                <Slot icon={<Sword className="w-6 h-6" />} name={weapon.name} note={`${stats.swordDamage} dmg`} badge={`T${run.weapon + 1}`} active testId="pause-weapon" />
                <Slot icon={<Shield className="w-6 h-6" />} name={armor.name} note={`${armor.maxArmor} armor`} badge={`T${run.armorTier + 1}`} active testId="pause-armor" />
                {UPGRADE_IDS.map((id) => {
                  const level = run.upgrades[id];
                  return (
                    <Slot
                      key={id}
                      icon={UPGRADE_ICONS[id]}
                      name={UPGRADES[id].name}
                      note={UPGRADE_LOOK[id]}
                      badge={level > 0 ? `Lv ${level}` : undefined}
                      active={level > 0}
                      testId={`pause-upgrade-${id}`}
                    />
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-[#e8dcc0]/45">
                {UPGRADE_IDS.map((id) => `${UPGRADES[id].name}: ${UPGRADES[id].perLevel.toLowerCase()}`).join(' · ')}
              </p>
            </div>
          </section>
        </div>
      </div>

      {/* Actions */}
      <div className="shrink-0 px-5 sm:px-8 pb-5 sm:pb-6 pt-3 flex items-center justify-center gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() => {
            onResume();
            emit(GAME_RESTART);
          }}
          className="flex items-center gap-2 border border-[#c9a84c]/40 text-[#e8dcc0]/80 hover:bg-[#c9a84c]/10 px-5 py-3 rounded-sm text-xs sm:text-sm tracking-[0.2em] uppercase transition-all active:scale-95"
          style={{ fontFamily: DISPLAY_FONT }}
          data-testid="button-abandon"
        >
          <RotateCcw className="w-4 h-4" />
          New run
        </button>
        <button
          type="button"
          onClick={onResume}
          className="flex items-center gap-2 bg-[#c9a84c] hover:bg-[#dcbb5f] text-[#1a1408] px-7 py-3 rounded-sm text-xs sm:text-sm tracking-[0.25em] uppercase font-bold transition-all active:scale-95 shadow-[0_0_30px_rgba(201,168,76,0.35)]"
          style={{ fontFamily: DISPLAY_FONT }}
          data-testid="button-resume"
        >
          <Play className="w-4 h-4 fill-current" />
          Resume
        </button>
      </div>
    </div>
  );
}

// ---- Pieces ----------------------------------------------------------------

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <h3 className="text-[13px] sm:text-sm tracking-[0.3em] uppercase text-[#c9a84c]" style={{ fontFamily: DISPLAY_FONT, fontWeight: 700 }}>
        {children}
      </h3>
      <span className="h-px flex-1 bg-gradient-to-r from-[#c9a84c]/50 to-transparent" />
    </div>
  );
}

/** Ten gold segments, filled left to right. */
function StatBar({ icon, label, fill, value, testId }: { icon: React.ReactNode; label: string; fill: number; value: string; testId?: string }) {
  const segments = 10;
  const filled = Math.round(Math.max(0, Math.min(1, fill)) * segments);
  return (
    <div className="flex items-center gap-3" data-testid={testId}>
      <span className="w-6 shrink-0 text-[#e8dcc0]/85 flex justify-center">{icon}</span>
      <span className="w-20 sm:w-28 shrink-0 text-[11px] sm:text-xs tracking-[0.2em] uppercase text-[#e8dcc0]/90" style={{ fontFamily: DISPLAY_FONT }}>
        {label}
      </span>
      <div className="flex-1 flex gap-[3px]" aria-hidden>
        {Array.from({ length: segments }, (_, i) => (
          <span
            key={i}
            className="h-3 flex-1 rounded-[1px] border"
            style={{
              background: i < filled ? `linear-gradient(180deg, #e0c36a, ${GOLD} 60%, #a8842f)` : 'rgba(232,220,192,0.05)',
              borderColor: i < filled ? '#e6cc7a' : 'rgba(201,168,76,0.3)',
            }}
          />
        ))}
      </div>
      <span className="w-12 sm:w-14 shrink-0 text-right text-sm tabular-nums text-[#e8dcc0]" style={{ fontFamily: DISPLAY_FONT }}>
        {value}
      </span>
    </div>
  );
}

function Ability({ icon, name, text }: { icon: React.ReactNode; name: string; text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="shrink-0 w-11 h-11 rounded-full border border-[#c9a84c]/60 bg-[#c9a84c]/5 flex items-center justify-center text-[#e0c36a] shadow-[inset_0_0_12px_rgba(201,168,76,0.15)]">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-sm tracking-[0.2em] uppercase text-[#e8dcc0]" style={{ fontFamily: DISPLAY_FONT, fontWeight: 700 }}>
          {name}
        </div>
        <p className="text-xs sm:text-[13px] leading-snug text-[#e8dcc0]/70" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
          {text}
        </p>
      </div>
    </li>
  );
}

function Slot({
  icon,
  name,
  note,
  badge,
  active,
  testId,
}: {
  icon: React.ReactNode;
  name: string;
  note: string;
  badge?: string;
  active: boolean;
  testId: string;
}) {
  return (
    <div
      className={`relative aspect-square min-w-0 rounded-sm border flex flex-col items-center justify-center gap-1 px-1 text-center ${
        active ? 'border-[#c9a84c]/70 bg-[#1a1610] text-[#e0c36a]' : 'border-[#c9a84c]/20 bg-[#0f0e11] text-[#e8dcc0]/30'
      }`}
      style={{ boxShadow: active ? 'inset 0 0 18px rgba(201,168,76,0.12)' : undefined }}
      title={`${name}: ${note}`}
      data-testid={testId}
      data-active={active}
    >
      {icon}
      <span className={`text-[9px] leading-tight tracking-wide uppercase line-clamp-2 ${active ? 'text-[#e8dcc0]/85' : 'text-[#e8dcc0]/35'}`} style={{ fontFamily: DISPLAY_FONT }}>
        {name}
      </span>
      {badge && (
        <span className="absolute -top-1.5 -right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-sm bg-[#c9a84c] text-[#1a1408]" style={{ fontFamily: DISPLAY_FONT }}>
          {badge}
        </span>
      )}
    </div>
  );
}

/** Stone archway emblem beside the title. */
function Emblem() {
  return (
    <svg viewBox="0 0 64 64" className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 text-[#c9a84c]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M8 58V30a24 24 0 0 1 48 0v28" />
      <path d="M16 58V32a16 16 0 0 1 32 0v26" />
      <path d="M4 58h56" />
      <path d="M8 40h8M48 40h8M8 50h8M48 50h8" opacity="0.7" />
      <path d="M32 8v-4M26 10l-2-3M38 10l2-3" opacity="0.7" />
      <path d="M24 58V40a8 8 0 0 1 16 0v18" fill="rgba(0,0,0,0.6)" />
    </svg>
  );
}

function Corner({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 40 40" className={`pointer-events-none absolute w-8 h-8 sm:w-10 sm:h-10 text-[#c9a84c]/70 ${className}`} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M2 38V14C2 8 8 2 14 2h24" />
      <path d="M6 30V16c0-5 5-10 10-10h14" opacity="0.6" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      <path d="M2 2l6 6M12 12l6-6" opacity="0.5" />
    </svg>
  );
}
