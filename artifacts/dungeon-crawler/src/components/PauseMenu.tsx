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
} from 'lucide-react';
import { GAME_RESTART, emit, type RunState } from '@/game/events';
import { armorAt, derive, UPGRADE_IDS, UPGRADES, weaponAt, type UpgradeId } from '@/game/shop';
import { SPELL_COST, SPELL_SPEED } from '@/game/Player';
import { TILE } from '@/game/textures';
import { HeroModel } from '@/components/HeroModel';

const UPGRADE_ICONS: Record<UpgradeId, React.ReactNode> = {
  vitality: <Heart className="w-4 h-4 text-red-400" />,
  focus: <Zap className="w-4 h-4 text-sky-400" />,
  reach: <Target className="w-4 h-4 text-violet-300" />,
  luck: <Clover className="w-4 h-4 text-emerald-400" />,
  strength: <Dumbbell className="w-4 h-4 text-amber-400" />,
};

/** What each upgrade adds to the hero model, so players know what to look for. */
const UPGRADE_LOOK: Record<UpgradeId, string> = {
  vitality: 'heart amulet',
  focus: 'mana crystals',
  reach: 'gold circlet',
  luck: 'clover charms',
  strength: 'arm bands',
};

/**
 * Pause screen: the full character sheet next to a 3D Wren wearing every
 * upgrade bought this run. Resume goes back to the cave exactly as it was.
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
      className="absolute inset-0 bg-black/85 backdrop-blur-sm pointer-events-auto z-40 flex flex-col"
      data-testid="pause-menu"
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-2 sm:px-8 sm:pt-6">
        <div>
          <div className="text-amber-300 text-xs uppercase tracking-[0.3em]">Paused</div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">Wren</h2>
          <p className="text-white/50 text-xs sm:text-sm mt-1">
            Depth {run.depth} · {weapon.name} · {armor.name}
          </p>
        </div>
        <button
          type="button"
          onClick={onResume}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black px-5 py-3 rounded-full font-black transition-all active:scale-95 shadow-[0_0_30px_rgba(245,158,11,0.35)]"
          data-testid="button-resume"
        >
          <Play className="w-5 h-5 fill-black" />
          Resume
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-8 pb-4 overscroll-contain" style={{ touchAction: 'pan-y' }}>
        <div className="max-w-5xl mx-auto grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          {/* Hero */}
          <section className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] p-3 flex flex-col">
            <HeroModel run={run} className="h-64 sm:h-80 lg:h-[26rem] rounded-xl overflow-hidden bg-gradient-to-b from-white/[0.04] to-black/40" />
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <Gear icon={<Sword className="w-4 h-4 text-orange-300" />} name={weapon.name} note={`${stats.swordDamage} damage`} testId="pause-weapon" />
              <Gear icon={<Shield className="w-4 h-4 text-slate-300" />} name={armor.name} note={`${run.armor}/${run.maxArmor} armor`} testId="pause-armor" />
            </div>
            <p className="mt-2 text-[11px] text-white/40 text-center">Drag to turn. Upgrades appear on the hero as you buy them.</p>
          </section>

          {/* Stats */}
          <section className="min-w-0 flex flex-col gap-4">
            <Card title="Vitals">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <Stat icon={<Heart className="w-4 h-4 text-red-500 fill-red-500" />} label="Health" value={`${Math.ceil(run.health)} / ${run.maxHealth}`} testId="pause-health" />
                <Stat icon={<Zap className="w-4 h-4 text-sky-400 fill-sky-400" />} label="Mana" value={`${Math.floor(run.mana)} / ${run.maxMana}`} testId="pause-mana" />
                <Stat icon={<Shield className="w-4 h-4 text-gray-300" />} label="Armor" value={`${run.armor} / ${run.maxArmor}`} />
                <Stat icon={<Coins className="w-4 h-4 text-yellow-400 fill-yellow-400" />} label="Coins" value={`${run.coins}`} testId="pause-coins" />
                <Stat icon={<Layers className="w-4 h-4 text-amber-200" />} label="Depth" value={`${run.depth}`} />
                <Stat icon={<Skull className="w-4 h-4 text-white/70" />} label="Kills" value={`${run.kills}`} testId="pause-kills" />
                <Stat icon={<KeyRound className={`w-4 h-4 ${run.hasKey ? 'text-yellow-300' : 'text-white/30'}`} />} label="Gate key" value={run.hasKey ? 'Carried' : 'Not found'} />
              </div>
            </Card>

            <Card title="Combat">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <Stat icon={<Sword className="w-4 h-4 text-orange-300" />} label="Sword damage" value={`${stats.swordDamage}`} testId="pause-sword-damage" />
                <Stat icon={<Sword className="w-4 h-4 text-orange-300" />} label="Sword reach" value={`${swordTiles.toFixed(1)} tiles`} />
                <Stat icon={<Sword className="w-4 h-4 text-orange-300" />} label="Swing" value={`${stats.swordCooldown} ms`} />
                <Stat icon={<Flame className="w-4 h-4 text-sky-300" />} label="Fireball damage" value={`${stats.spellDamage}`} />
                <Stat icon={<Flame className="w-4 h-4 text-sky-300" />} label="Fireball range" value={`${spellTiles.toFixed(1)} tiles`} />
                <Stat icon={<Flame className="w-4 h-4 text-sky-300" />} label="Fireball cost" value={`${SPELL_COST} mana`} />
                <Stat icon={<Zap className="w-4 h-4 text-sky-400" />} label="Mana regen" value={`${stats.manaRegen} / s`} />
                <Stat icon={<Coins className="w-4 h-4 text-yellow-400" />} label="Gold coin odds" value={pct(stats.goldChance)} />
                <Stat icon={<Sparkles className="w-4 h-4 text-cyan-300" />} label="Bonus gem odds" value={pct(stats.gemChance)} />
                <Stat icon={<Coins className="w-4 h-4 text-yellow-400" />} label="Extra coin odds" value={pct(stats.extraDropChance)} />
              </div>
            </Card>

            <Card title="Upgrades">
              <ul className="flex flex-col divide-y divide-white/5" data-testid="pause-upgrades">
                {UPGRADE_IDS.map((id) => {
                  const level = run.upgrades[id];
                  return (
                    <li key={id} className="flex items-center gap-3 py-2" data-testid={`pause-upgrade-${id}`}>
                      <span className="shrink-0">{UPGRADE_ICONS[id]}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className={`font-bold ${level > 0 ? 'text-white' : 'text-white/50'}`}>{UPGRADES[id].name}</span>
                          <span className="text-[10px] uppercase tracking-wider text-white/40">{UPGRADE_LOOK[id]}</span>
                        </div>
                        <div className="text-xs text-white/50 truncate">{UPGRADES[id].perLevel}</div>
                      </div>
                      <span
                        className={`shrink-0 text-xs font-bold rounded-full px-2 py-0.5 border ${
                          level > 0 ? 'text-amber-300 bg-amber-400/10 border-amber-400/20' : 'text-white/30 border-white/10'
                        }`}
                      >
                        {level > 0 ? `Lv ${level}` : 'none'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </section>
        </div>
      </div>

      <div className="p-3 sm:p-4 border-t border-white/10 bg-black/40 flex justify-center gap-3">
        <button
          type="button"
          onClick={() => {
            onResume();
            emit(GAME_RESTART);
          }}
          className="flex items-center gap-2 border border-white/15 text-white/70 hover:bg-white/5 px-5 py-3 rounded-full font-bold transition-all active:scale-95"
          data-testid="button-abandon"
        >
          <RotateCcw className="w-4 h-4" />
          New run
        </button>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 sm:p-4">
      <div className="text-[10px] uppercase tracking-[0.3em] text-white/40 mb-2">{title}</div>
      {children}
    </div>
  );
}

function Stat({ icon, label, value, testId }: { icon: React.ReactNode; label: string; value: string; testId?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-black/40 px-3 py-2 min-w-0" data-testid={testId}>
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-white/40 truncate">{label}</div>
        <div className="text-sm font-bold text-white truncate">{value}</div>
      </div>
    </div>
  );
}

function Gear({ icon, name, note, testId }: { icon: React.ReactNode; name: string; note: string; testId: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-black/40 px-3 py-2 min-w-0" data-testid={testId}>
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="font-bold text-white truncate">{name}</div>
        <div className="text-white/50 truncate">{note}</div>
      </div>
    </div>
  );
}
