import Phaser from 'phaser';
import { ANIMS, FRAME, frameName, renderHeroSheet, type Anim, type Dir } from './heroSheet';

export const HERO_TEXTURE = 'hero';

export const heroAnimKey = (anim: Anim, dir: Dir) => `hero-${anim}-${dir}`;

/**
 * Renders the procedural hero sheet into a canvas texture, registers one
 * frame per sprite and one animation per (anim, direction). Safe to call on
 * every scene start: textures and animations are global and only made once.
 *
 * To swap in hand-made art, replace this body with
 * `scene.load.atlas(HERO_TEXTURE, 'sprites/hero.png', 'sprites/hero.json')`
 * in preload; the frame names and animation keys stay the same.
 */
export function installHero(scene: Phaser.Scene) {
  if (!scene.textures.exists(HERO_TEXTURE)) {
    const sheet = renderHeroSheet();
    const texture = scene.textures.createCanvas(HERO_TEXTURE, sheet.width, sheet.height);
    if (!texture) throw new Error('Could not create hero canvas texture');
    const ctx = texture.getContext();
    ctx.putImageData(new ImageData(sheet.data, sheet.width, sheet.height), 0, 0);
    for (const f of sheet.frames) texture.add(f.name, 0, f.x, f.y, FRAME, FRAME);
    // Crisp pixels at any zoom; everything else in the game stays smoothed.
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    texture.refresh();
  }

  for (const anim of Object.keys(ANIMS) as Anim[]) {
    const def = ANIMS[anim];
    for (const dir of def.dirs) {
      const key = heroAnimKey(anim, dir);
      if (scene.anims.exists(key)) continue;
      scene.anims.create({
        key,
        frames: Array.from({ length: def.frames }, (_, i) => ({
          key: HERO_TEXTURE,
          frame: frameName(anim, dir, i),
        })),
        frameRate: def.fps,
        repeat: def.loop ? -1 : 0,
      });
    }
  }
}
