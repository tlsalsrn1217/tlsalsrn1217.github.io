// 런 컨트롤러 — 편성(메타) · 무대 · 웨이브 · 경제 · 정비 상점을 하나로 묶는다.
//
// 스탯 계산 규칙 하나만 지킨다: **런 중 스탯은 언제나 처음부터 다시 계산한다.**
// 게임은 기어를 먹을 때마다 PlayerStats 에 곱해 넣고(Gear.Take) 되돌릴 때 역연산한다 — 게임에서는
// 그게 맞다(한 번 지나가면 끝이니까). 도구에서는 슬라이더를 왼쪽으로도 끌 수 있어야 하므로
// 같은 방식을 쓰면 부동소수 오차가 쌓이고 되돌릴 수 없는 축이 생긴다. 그래서 편성 → 기어 → 부속을
// 매번 순서대로 다시 접는다. 결과값은 게임과 같고, 되돌리기가 공짜다.
import * as B from './balance.js';
import * as meta from './meta.js';
import { WaveEngine } from './waves.js';
import { GEAR, GEAR_MUL, SHOP_ITEMS, SHOP_RARES, SUPPLIES, ITEM_DUP_MUL, MAX_DISCOUNT } from './defs.js';
import { MC } from './formulas.js';
import { Runtime, DEFS } from './skills.js';

/** 정비 상점 매물로 나오는 스킬·무기와 가격 가중치(UpgradeSystem.PriceWeight 그대로). */
export const OFFER_WEIGHT = {
  Chain: 1.15, Explode: 1.10, FireField: 1.10, FrostAura: 1.10, Gravity: 1.10, Split: 1.05,
  Orbital: 1.35, Repair: 0.95, Mine: 1.00, MineBreak: 1.05, Timeslow: 0.85, Pulse: 0.75,
  BombWeapon: 1.15, HomingWeapon: 1.10, OrbitalWeapon: 1.10, DroneWeapon: 1.00,
  BoomerangWeapon: 1.00, SupportDroneWeapon: 0.80, CoreShieldSkill: 0.80,
};
const PRICE_CUT = 0.8;                 // UpgradeSystem.PriceCutMul — 물가 인하는 전 결제에 공통이다
const SKILL_MAX = 7, WEAPON_MAX = 8;   // 액티브 만렙 / 드래프트 무기 만렙
const isWeaponKey = (k) => /Weapon$|CoreShieldSkill/.test(k);
export const maxLevelOf = (k) => (isWeaponKey(k) ? WEAPON_MAX : SKILL_MAX);

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class Run {
  /**
   * @param stage Stage 인스턴스
   * @param loadout meta.defaultLoadout() 모양
   */
  constructor(stage, loadout) {
    this.stage = stage;
    this.loadout = loadout;
    this.reset();
  }

  reset() {
    // ── 런 스코프 성장(전부 0에서 시작. GameFlow.BuildRun 의 ResetRun 5줄과 같다) ──
    this.gear = {};                 // { Power: 3, ... }
    this.skills = {};               // { Chain: 2, BombWeapon: 1, ... }
    this.items = {};                // { plug: 2, ... } 부속 보유 수
    this.cannonLv = 1;
    this.cannonEvo = false;

    // ── 지갑과 집계 ──
    this.cells = 0;                 // 정비 상점 결제 수단(GameState.scrap)
    this.cellsEarned = 0;
    this.score = 0;
    this.kills = 0;
    this.timeAlive = 0;
    this.damageDealt = 0;
    this.ledger = [];               // 웨이브별 수지 — 경제 그래프가 이걸 그린다
    this.spent = 0;
    this.over = false;              // 사망
    this.cleared = false;
    // 보급은 런 전체 재고다(회차마다 리필되지 않는다) — 다 쓰면 그 판에선 끝이다.
    this.supplyStock = Object.fromEntries(SUPPLIES.map((s) => [s.kind, s.stock]));
    this.buffs = { Power: 0, Thrust: 0, Core: 0 };   // 남은 초
    // 마지막에 한 번 곱하는 손잡이. 게임에는 없는 축이다 — "체력만 두 배면 어디까지 버티나"처럼
    // 편성으로는 만들 수 없는 가정을 세워 보려고 둔다. 1이면 아무 일도 안 한다.
    this.override = { hp: 1, dmg: 1, move: 1, fire: 1, enemyHp: 1, enemyDmg: 1, enemySpeed: 1 };
    this.shopOpen = false;
    this.offers = null;
    this.rerolls = 0;

    this.stage.setPlanet(this.loadout.planet);
    this.stage.reset();
    this.recompute();

    this.wave = new WaveEngine({
      planet: this.loadout.planet,
      endless: false,
      spawn: (k, st, o) => {
        const ov = this.override;
        st.maxHp *= ov.enemyHp; st.contactDamage *= ov.enemyDmg; st.speed *= ov.enemySpeed;
        this.stage.spawn(k, st, o);
      },
      aliveCount: () => this.stage.combatAlive(),
      heavyAlive: () => this.stage.heavyAlive(),
      onWaveStart: (no, w) => this.onWaveStart(no, w),
      onWaveEnd: (no, w) => this.onWaveEnd(no, w),
      onCleared: () => this.finish(true),
    });

    this.stage.onKill = (e, score) => {
      this.kills++; this.score += score * 100;   // GameState.ScoreMul
    };
    this.stage.onPickCell = (v) => { this.cells += v; this.cellsEarned += v; };
    this.stage.onPlayerDeath = () => this.finish(false);
  }

  begin() { this.reset(); this.wave.begin(); }

  // ── 스탯 조립 ───────────────────────────────────────────────────────────
  /**
   * 편성 → 기어 → 부속 순서로 다시 접는다. 순서는 게임의 적용 시점과 같다:
   * 기어는 런 시작 직후 라이브 적용(Gear.Take), 부속은 상점 구매 시점(RunItems.Apply).
   */
  recompute() {
    const s = meta.build(this.loadout);

    // ① 기어 13종. 게터형(고폭탄두·원소 증폭기)은 게임에서도 휴면이다 —
    //    2026-08-03 패시브 폐지 이후 폭발·지속피해의 출처가 전부 부속(PlayerStats)으로 옮겨 갔다.
    //    카드 문구만 남고 실제로 곱하는 곳이 없다. 여기서 "고쳐" 적용하면 도구만 게임보다 세진다.
    const g = (k) => this.gear[k] | 0;
    s.damageMul *= Math.pow(GEAR_MUL.Power, g('Power'));
    s.fireInterval *= Math.pow(GEAR_MUL.Cool, g('Cooling'));
    s.moveSpeed *= Math.pow(GEAR_MUL.Thrust, g('Thruster'));
    s.pierce += g('Pierce');
    s.critChance += 0.05 * g('Crit');
    s.critMult += 0.15 * g('Crit');
    s.maxHP *= Math.pow(GEAR_MUL.Armor, g('Armor'));
    s.magnetMul += 0.2 * g('Magnet');
    s.xpMul += 0.25 * g('Collector');
    s.coinMul += 0.25 * g('Collector');
    s.lifesteal += 0.02 * g('Vampire');
    s.reflect += 8 * g('Reflect');

    // ②' 보급 버프(RunBuffs). 30초짜리라 스탯이 아니라 시한부 배수다.
    if (this.buffs) {
      if (this.buffs.Power > 0) s.damageMul *= 1.25;
      if (this.buffs.Thrust > 0) s.moveSpeed *= 1.20;
      if (this.buffs.Core > 0) { s.damageMul *= 1.15; s.maxHP *= 1.15; s.moveSpeed *= 1.15; }
    }

    // ② 부속(RunItems.Apply). 보유 수만큼 반복 적용한다 — 게임도 구매 때마다 한 번씩 곱한다.
    for (const [id, n] of Object.entries(this.items)) {
      const it = itemById(id);
      if (!it) continue;
      for (let i = 0; i < n; i++) for (const m of it.mods) applyItemMod(s, m);
    }
    // ③ 직접 덮어쓰기(도구 전용). 편성·기어·부속을 다 접은 뒤 맨 마지막에 한 번만 곱한다.
    const o = this.override;
    if (o) {
      s.maxHP *= o.hp; s.damage = Math.max(1, Math.round(s.damage * o.dmg));
      s.moveSpeed *= o.move; s.fireInterval /= Math.max(0.05, o.fire);
    }
    s.critChance = clamp01(s.critChance);
    if (s.fireInterval < 0.04) s.fireInterval = 0.04;

    this.stats = s;
    this.stage.applyStats(s);
    this.stage.cannonLv = this.cannonLv;
    this.stage.cannonEvo = this.cannonEvo;
    this.syncRuntimes();
    return s;
  }

  /**
   * 보유 스킬을 무대 위의 구동기로 맞춘다. 레벨이나 화력이 그대로면 손대지 않는다 —
   * 슬라이더를 끄는 동안 매 프레임 새로 만들면 궤도 칼날이 영영 한 바퀴를 못 돈다.
   */
  syncRuntimes() {
    this.runtimes ||= new Map();
    const dmg = this.stats.damage, cd = this.stats.cooldownMul;
    for (const [k, lv] of Object.entries(this.skills)) {
      if (!(lv > 0) || !DEFS[k]) { this.runtimes.delete(k); continue; }
      const cur = this.runtimes.get(k);
      if (!cur) { this.runtimes.set(k, new Runtime(this.stage, k, { level: lv, dmg, cdMul: cd })); continue; }
      if (cur.o.level !== lv || cur.o.dmg !== dmg || cur.o.cdMul !== cd) cur.setOpts({ level: lv, dmg, cdMul: cd });
    }
    for (const k of [...this.runtimes.keys()]) if (!(this.skills[k] > 0)) this.runtimes.delete(k);
    // 무대는 그리기만 맡는다 — 설치물(칼날·드론·보호막)은 유닛 위 층에 올라간다.
    this.stage.groundHook = (ctx, st) => { for (const r of this.runtimes.values()) r.draw(ctx, st); };
    this.stage.topHook = (ctx, st) => { for (const r of this.runtimes.values()) r.drawTop(ctx, st); };
  }

  // ── 웨이브 ─────────────────────────────────────────────────────────────
  onWaveStart(no, w) {
    // 물량 파도는 개체 값어치가 깎인다(EnemySpawner.HordeRewardMul) — 수가 두 배라도 잔치가 되면 안 된다.
    this.stage.rewardMul = w.type === 'horde' ? 0.75 : 1;
    this.waveStartCells = this.cells;
    if (w.type === 'boss' || w.type === 'cmd') this.spawnBoss(w.type === 'boss');
  }

  onWaveEnd(no, w) {
    this.ledger.push({
      wave: no, type: w.type,
      earned: this.cellsEarned - (this.ledgerEarned || 0),
      wallet: this.cells, kills: this.kills, time: Math.round(this.timeAlive),
    });
    this.ledgerEarned = this.cellsEarned;
    this.shopOpen = true;
    this.offers = null;   // 다음 열람에 새로 굴린다
    this.rerolls = 0;
    this.onShopOpen?.(no);
  }

  /** 지휘관·최종보스. 체력은 spawn.bossMidHpMul / bossFinalHpMul 배수다. */
  spawnBoss(isFinal) {
    const sp = B.D().spawn;
    const st = this.wave.statsFor('Boss');
    st.maxHp = this.wave.baseHp() * (isFinal ? sp.bossFinalHpMul : sp.bossMidHpMul);
    st.maxHp *= this.override.enemyHp;
    st.contactDamage *= this.override.enemyDmg;
    st.speed *= this.override.enemySpeed;
    st.size = (isFinal ? 0.85 : 0.7) * 2;   // 유저 2026-08-06: 월드 지름 직접 고정
    this.stage.spawn('Boss', st, { angle: Math.PI / 2 });
  }

  closeShop() {
    this.shopOpen = false;
    this.offers = null;
    if (this.wave.bossPending) { this.wave.running = true; return; }
    this.wave.next();
  }

  update(dt) {
    if (this.over || this.cleared || this.shopOpen) return;
    this.timeAlive += dt;
    this.wave.update(dt);
    this.stage.update(dt);
    if (!this.stage.agent.dead) for (const r of this.runtimes.values()) r.update(dt);
    this.tickBuffs(dt);
    // 보스가 죽었으면 그 웨이브가 끝난다(ObjectiveDirector.ResolveBossWave).
    if (this.wave.bossPending && !this.stage.enemies.some((e) => e.boss)) this.wave.resolveBoss();
  }

  /** 버프 타이머. 하나가 끝나는 순간에만 스탯을 다시 접는다 — 매 프레임 접으면 비싸다. */
  tickBuffs(dt) {
    let expired = false;
    for (const k of Object.keys(this.buffs)) {
      if (this.buffs[k] <= 0) continue;
      this.buffs[k] -= dt;
      if (this.buffs[k] <= 0) { this.buffs[k] = 0; expired = true; }
    }
    if (expired) this.recompute();
  }

  /** 보급 구매(보급상 NPC). 재고와 셀을 같이 본다. */
  buySupply(kind) {
    const def = SUPPLIES.find((s) => s.kind === kind);
    if (!def || (this.supplyStock[kind] | 0) <= 0) return false;
    const p = this.pay(def.price);
    if (this.cells < p) return false;
    this.cells -= p; this.spent += p;
    this.supplyStock[kind]--;
    const sec = B.D().shop.buffSec;
    const a = this.stage.agent;
    switch (kind) {
      case 'HealBig':    a.hp = Math.min(a.maxHp, a.hp + a.maxHp * 0.7); break;
      case 'Power':      this.buffs.Power = sec; break;
      case 'Thrust':     this.buffs.Thrust = sec; break;
      case 'ShieldMega': this.stage.shieldCharges += 3; break;
      case 'Core':       this.buffs.Core = sec; break;
    }
    this.recompute();
    return true;
  }

  /** 런 종료 정산(GameState.TriggerGameOver / TriggerStageClear). 코인은 여기서만 생긴다. */
  finish(cleared) {
    if (this.over || this.cleared) return;
    const eco = B.D().economy;
    const mult = Math.max(1, B.planet(this.loadout.planet).coinPerKill);
    this.coins = 0;
    if (cleared) {
      this.cleared = true;
      // 첫 클리어는 전액, 반복은 절반. 남은 셀도 절반 비율로 코인이 된다(마지막 웨이브 수입을 안 버리려고).
      this.firstClear = true;
      this.coins = Math.round(eco.clearBonusBase * mult * (this.firstClear ? 1 : eco.clearRepeatFrac));
      if (this.cells > 0) { this.coins += Math.round(this.cells * eco.clearRepeatFrac); this.cells = 0; }
      this.gems = eco.gemRewardFirstClear;
    } else {
      this.over = true;
      // 사망은 클리어 보너스가 없다. 판을 끝내야 돈이 된다 — 그게 이 게임의 수입 구조다.
      this.gems = 0;
    }
    this.accountXp = Math.round(this.score / 100);   // 계정 XP 는 100배 환산 전 단위로 쌓인다
    this.onFinish?.(cleared);
  }

  // ── 정비 상점 ───────────────────────────────────────────────────────────
  /** 정비 할인(ShopCatalog.Pay) — 상점의 모든 결제가 이 함수 하나를 지난다. */
  pay(price) { return Math.max(1, Math.round(price * this.stats.shopDiscountMul)); }

  skillPrice(key) {
    const lv = this.skills[key] | 0;
    const p = B.D().shop.skillBasePrice * (lv + 1) * PRICE_CUT * (OFFER_WEIGHT[key] ?? 1);
    return this.pay(Math.max(1, Math.round(p)));
  }

  cannonPrice() {
    const sh = B.D().shop;
    const mul = Math.max(1.01, sh.cannonPriceMul);
    return this.pay(sh.skillBasePriceCannon * Math.pow(mul, this.cannonLv) * PRICE_CUT);
  }

  itemPrice(it) {
    const band = Math.max(0, Math.min(ITEM_DUP_MUL.length - 1, it.band));
    const step = B.D().shop.itemDupPriceStep * ITEM_DUP_MUL[band];
    return this.pay(Math.round(it.price * Math.pow(1 + step, this.items[it.id] | 0)));
  }

  rerollPrice() {
    const sh = B.D().shop;
    return this.pay(sh.rerollBase + sh.rerollStep * this.rerolls);
  }

  /** 그 웨이브에 나올 수 있는 부속 밴드(ShopCatalog.OfferBands). 14웨이브 기준 구간이다. */
  offerBands(waveNo) {
    if (waveNo <= 4) return [0];
    if (waveNo <= 8) return [0, 1];
    if (waveNo <= 11) return [1, 2];
    return [1, 2, 3];
  }

  rollOffers() {
    const sh = B.D().shop;
    const waveNo = this.wave.waveNo;
    const keys = Object.keys(OFFER_WEIGHT).filter((k) => (this.skills[k] | 0) < maxLevelOf(k));
    const bands = this.offerBands(waveNo);
    const pool = SHOP_ITEMS.filter((i) => bands.includes(i.band));
    const nItems = sh.itemOfferMin + Math.floor(Math.random() * (sh.itemOfferMax - sh.itemOfferMin + 1));
    this.offers = {
      skills: pick(keys, sh.slotWeapon),
      gear: pick(GEAR.filter((x) => (this.gear[x.g] | 0) < x.max).map((x) => x.g), sh.slotGear),
      items: pick(pool.length ? pool : SHOP_ITEMS, nItems),
    };
    return this.offers;
  }

  reroll() {
    const p = this.rerollPrice();
    if (this.cells < p) return false;
    this.cells -= p; this.spent += p; this.rerolls++;
    this.rollOffers();
    return true;
  }

  buySkill(key) {
    const p = this.skillPrice(key);
    if (this.cells < p || (this.skills[key] | 0) >= maxLevelOf(key)) return false;
    this.cells -= p; this.spent += p;
    this.skills[key] = (this.skills[key] | 0) + 1;
    this.offers.skills = this.offers.skills.filter((k) => k !== key);
    this.recompute();
    return true;
  }

  buyGear(g) {
    const def = GEAR.find((x) => x.g === g);
    const lv = this.gear[g] | 0;
    if (!def || lv >= def.max) return false;
    // 기어는 스킬과 같은 가격표를 쓴다(기준선 1.00 — 가중치 표에 없으므로).
    const p = this.pay(Math.max(1, Math.round(B.D().shop.skillBasePrice * (lv + 1) * PRICE_CUT)));
    if (this.cells < p) return false;
    this.cells -= p; this.spent += p;
    this.gear[g] = lv + 1;
    this.offers.gear = this.offers.gear.filter((k) => k !== g);
    this.recompute();
    return true;
  }

  buyItem(id) {
    const it = itemById(id);
    if (!it) return false;
    const p = this.itemPrice(it);
    if (this.cells < p) return false;
    this.cells -= p; this.spent += p;
    this.items[id] = (this.items[id] | 0) + 1;
    this.recompute();
    return true;
  }

  buyCannon() {
    if (this.cannonLv >= MC.MAX_LV) return false;
    const p = this.cannonPrice();
    if (this.cells < p) return false;
    this.cells -= p; this.spent += p;
    this.cannonLv++;
    this.recompute();
    return true;
  }
}

const pick = (arr, n) => {
  const a = arr.slice();
  const out = [];
  while (out.length < n && a.length) out.push(...a.splice(Math.floor(Math.random() * a.length), 1));
  return out;
};

export const itemById = (id) => SHOP_ITEMS.find((i) => i.id === id) || SHOP_RARES.find((i) => i.id === id) || null;

/** 부속 한 줄을 스탯에 얹는다(RunItems.Apply 그대로). 축 이름은 ShopCatalog.Stat. */
export function applyItemMod(s, m) {
  switch (m.stat) {
    case 'Damage':    s.damageMul *= 1 + m.v; break;
    case 'FireRate':  s.fireInterval /= Math.max(0.1, 1 + m.v); break;   // 연사↑ = 간격↓
    case 'Crit':      s.critChance += m.v; break;
    case 'CritDmg':   s.critMult += m.v; break;
    case 'Cooldown':  s.cooldownMul *= clamp01(1 - m.v); break;          // 곱으로 깎아 0에 안 닿게
    case 'MoveSpeed': s.moveSpeed *= 1 + m.v; break;
    case 'ScrapGain': s.xpMul += m.v; break;
    case 'CellDrop':  s.cellDropMul += m.v; break;
    case 'Armor':     s.armor = Math.max(0, s.armor + m.v); break;
    case 'MaxHp':     s.maxHP = Math.max(1, s.maxHP + m.v); break;
    case 'Discount':
      s.shopDiscountMul = Math.max(1 - MAX_DISCOUNT, s.shopDiscountMul * clamp01(1 - m.v));
      break;
  }
}

export { SUPPLIES };
