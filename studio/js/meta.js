// 메타 조립기 — 출격 전 세팅(요원·무기·장비·연구·계정 레벨)을 인게임 PlayerStats 로 접는다.
//
// **순서가 곧 정답이다.** GameFlow.BuildRun 의 조립 순서를 한 줄씩 그대로 옮겼다. 같은 값을 곱해도
// 순서가 다르면 결과가 다르다 — 예를 들어 공격력은 ×10 전에 곱하면 정수 반올림에 삼켜지고(2×1.03=2),
// 기동성은 장비 가산 뒤에 곱하면 "무기 무게"가 아니라 "전체 페널티"가 된다. 게임이 그 함정을
// 하나씩 밟아 가며 지금 순서로 굳혔으므로, 여기서 순서를 "정리"하면 도구만 틀린 값을 보여 준다.
//
// 게임 원본 순서(GameFlow.BuildRun 1 ~ 3.5):
//   1   요원 기본치         → 2 장착 무기 발사 정체성 → [스냅샷] → 1.5 요원 레벨
//   1.7 스킨 → 1.8 기동성 → 2 장비 가산 → damage ×10 → 3 연구 → 3.5 계정 레벨 배율
import * as B from './balance.js';
import { SHIPS, WEAPONS, EQUIP, RESEARCH, EQ_RATE, EQ_STAT_BASE, EQ_STAT_TIER_STEP,
         EQ_LEVELS_PER_TIER, weaponById, equipById } from './defs.js';

/** 편성 기본값. UI 가 이 모양을 그대로 편집한다. */
export function defaultLoadout() {
  return {
    shipName: 'Scout',
    shipLevel: 0,                 // 0..growth.shipLvMax
    weaponId: 1,                  // 볼트 피스톨(스타터)
    accountLevel: 1,              // 1..account.maxLevel
    planet: 0,                    // 0..5
    // 장비 4슬롯. tier 0..5, level 0..5. id = null 이면 미장착.
    equip: {
      Weapon: { id: 1, tier: 0, level: 0 },
      Body:   { id: 2, tier: 0, level: 0 },
      Core:   { id: 3, tier: 0, level: 0 },
      Engine: { id: 0, tier: 0, level: 0 },
    },
    research: [0, 0, 0, 0, 0, 0],  // 6분야 레벨
    skin: { hpMul: 1, moveMul: 1, fireMul: 1, dmgMul: 1 },
  };
}

/** 요원 정의 = 코드 기본값 + balance.json ships 부분 오버레이(ShipDef.Get 규칙 그대로). */
export function shipDef(name) {
  const base = SHIPS.find((s) => s.name === name) || SHIPS[0];
  const d = { ...base };
  const c = B.ship(name);
  if (c) {
    // 발사 정체성 4축은 무조건 덮는다. 파워 축은 센티널(-1/0) 가드로 부분 오버레이한다.
    d.fireInterval = c.fireInterval; d.bulletCount = c.bulletCount;
    d.bulletSpeed = c.bulletSpeed; d.range = c.range; d.pierce = c.pierce;
    if (c.maxHP > 0) d.maxHP = c.maxHP;
    if (c.moveSpeed > 0) d.moveSpeed = c.moveSpeed;
    if (c.defense >= 0) d.defense = c.defense;
    if (c.damage > 0) d.damage = c.damage;
    if (c.chargeRate > 0) d.chargeRate = c.chargeRate;
  }
  return d;
}

/** 장비 스탯 구동 포인트(EquipCatalog.StatP). 레벨0도 바닥값이 있어 "장착 후 +0%"가 안 나온다. */
export const statP = (tier, level) => EQ_STAT_BASE + tier * EQ_STAT_TIER_STEP + level;
/** 가격·표시용 파워(EquipCatalog.Power) — 스탯 구동값과 일부러 다르다. */
export const equipPower = (tier, level) => tier * EQ_LEVELS_PER_TIER + level;

/** 계정 레벨 배율(AccountLevel.ApplyMetaBoost) — 메타 델타에만 걸린다. */
const boost = (base, cur, m) => base + (cur - base) * m;
function boostInt(base, cur, m) {
  if (cur === base) return cur;
  const v = Math.round(base + (cur - base) * m);
  return cur > base ? Math.max(cur, v) : Math.min(cur, v);   // 반올림이 투자분을 깎지 않게
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * 편성 → PlayerStats. 반환값의 필드 이름은 게임 PlayerStats 와 같게 둔다 —
 * 전투 코드(waves/run/skills)가 게임과 같은 이름을 읽어야 대조가 된다.
 */
export function build(lo) {
  const def = shipDef(lo.shipName);
  const wep = weaponById(lo.weaponId) || weaponById(1);
  const g = B.D().growth;

  const s = {
    // ① 요원 기본치
    maxHP: def.maxHP,
    moveSpeed: def.moveSpeed,
    damage: def.damage,            // ×10 은 장비 가산 뒤
    defense: def.defense,          // PlayerHealth.defense (0..1 정률 감산)
    // ② 발사 정체성 = 장착 무기가 정한다(요원이 아니다)
    fireInterval: wep.fireInterval,
    projectiles: wep.bulletCount,
    bulletSpeed: wep.bulletSpeed * 0.7,   // 07-31 유저: 탄이 안 보였다 → 전 무기 -30%
    bulletScale: wep.bulletScale,
    range: wep.range,
    pierce: wep.pierce,
    critChance: 0.15,
    critMult: 2,
    // 나머지 축은 PlayerStats 기본값
    damageMul: 1, magnetMul: 1, xpMul: 1, dropMul: 1, chargeMul: 1, coinMul: 1,
    armor: 0, regen: 0, dodge: 0, lifesteal: 0, reflect: 0, iframe: 0, luck: 0,
    dotMul: 1, cellDropMul: 1, cooldownMul: 1, explosiveMul: 1, shopDiscountMul: 1,
  };

  // ③ 스냅샷 — 여기까지가 "요원 기본". 이 뒤로 늘어난 분만 계정 레벨 배율의 대상이다.
  const b = { ...s };

  // ④ 요원 레벨(+2%/Lv). 이속은 절반만, 공격력은 ×10 뒤 가산(정수 반올림 소실 방지).
  const m = 1 + g.shipStatPerLv * lo.shipLevel;
  s.maxHP = def.maxHP * m;
  s.moveSpeed = def.moveSpeed * (1 + (m - 1) * 0.5);
  s.defense = Math.min(0.85, def.defense * m);
  const damageBonus10 = Math.round(def.damage * 10 * (m - 1));

  // ⑤ 스킨(요원 기본치의 %가 되도록 장비 가산 전에 곱한다)
  const skin = lo.skin || { hpMul: 1, moveMul: 1, fireMul: 1, dmgMul: 1 };
  s.maxHP *= skin.hpMul;
  s.moveSpeed *= skin.moveMul;
  s.fireInterval *= skin.fireMul;

  // ⑥ 기동성 — 무거운 총을 들면 느려진다. 장비 가산 **전**이라야 "무기 무게"로 읽힌다.
  s.moveSpeed *= wep.mobility;

  // ⑦ 장비 가산(EquipCatalog.Apply). 공격력만 따로 모아 ×10 전에 정수 가산한다.
  let dmgAcc = 0;
  for (const slot of ['Weapon', 'Body', 'Core', 'Engine']) {
    const e = lo.equip[slot];
    if (!e || e.id == null) continue;
    const item = equipById(e.id);
    if (!item) continue;
    const P = statP(e.tier, e.level);
    for (const mod of item.mods) {
      const wgt = mod.w;
      switch (mod.stat) {
        case 'Damage':    dmgAcc += EQ_RATE.DMG * P * wgt; break;
        case 'FireRate':  s.fireInterval *= Math.pow(EQ_RATE.FIRE_BASE, P * wgt); break;
        case 'Crit':      s.critChance = Math.min(0.95, s.critChance + EQ_RATE.CRITCH * P * wgt); break;
        case 'CritDmg':   s.critMult += EQ_RATE.CRITDMG * P * wgt; break;
        case 'Cooldown':  s.cooldownMul *= Math.pow(EQ_RATE.CD_BASE, P * wgt); break;
        case 'MaxHp':     s.maxHP += EQ_RATE.HP * P * wgt; break;
        case 'Armor':     s.armor += EQ_RATE.ARMOR * P * wgt; break;
        case 'MoveSpeed': s.moveSpeed += EQ_RATE.MOVE * P * wgt; break;
        case 'CellDrop':  s.cellDropMul += EQ_RATE.CELL * P * wgt; break;
        case 'ScrapGain': s.xpMul += EQ_RATE.SCRAP * P * wgt; break;
      }
    }
  }
  s.damage += Math.round(dmgAcc);

  // ⑧ 타격 수치 두 자릿수 스케일. 스냅샷에도 같이 걸어야 배율이 폭주하지 않는다.
  s.damage *= 10;
  s.damage += damageBonus10;
  if (skin.dmgMul !== 1) s.damage += Math.round(s.damage * (skin.dmgMul - 1));
  b.damage *= 10;

  // ⑨ 연구(ResearchDef.Apply)
  for (const d of RESEARCH) {
    const lv = lo.research[d.id] | 0;
    if (lv <= 0) continue;
    const raw = d.perLevel * lv, f = raw / 100;
    switch (d.stat) {
      case 'Damage':    s.damage = Math.max(1, Math.round(s.damage * (1 + f))); break;
      case 'MaxHp':     s.maxHP *= 1 + f; break;
      case 'Armor':     s.armor += raw; break;               // flat 정감(상점 부속과 같은 단위)
      case 'Crit':      s.critChance = clamp01(s.critChance + f); break;
      case 'MoveSpeed': s.moveSpeed *= 1 + f; break;
      case 'ScrapGain': s.xpMul *= 1 + f; break;
    }
  }
  if (s.fireInterval < 0.04) s.fireInterval = 0.04;   // 연사 안전 하한

  // ⑩ 계정 레벨 — 메타 투자분에만 (1 + statPerLevel × (Lv-1))
  const am = 1 + Math.max(0, B.D().account.statPerLevel) * (lo.accountLevel - 1);
  if (am > 1) {
    s.moveSpeed = boost(b.moveSpeed, s.moveSpeed, am);
    s.fireInterval = boost(b.fireInterval, s.fireInterval, am);   // 낮을수록 좋음 = 음수 델타가 커진다
    s.damageMul = boost(b.damageMul, s.damageMul, am);
    s.bulletSpeed = boost(b.bulletSpeed, s.bulletSpeed, am);
    s.bulletScale = boost(b.bulletScale, s.bulletScale, am);
    s.range = boost(b.range, s.range, am);
    s.maxHP = boost(b.maxHP, s.maxHP, am);
    s.critChance = clamp01(boost(b.critChance, s.critChance, am));
    s.critMult = boost(b.critMult, s.critMult, am);
    s.magnetMul = boost(b.magnetMul, s.magnetMul, am);
    s.xpMul = boost(b.xpMul, s.xpMul, am);
    s.dropMul = boost(b.dropMul, s.dropMul, am);
    s.chargeMul = boost(b.chargeMul, s.chargeMul, am);
    s.coinMul = boost(b.coinMul, s.coinMul, am);
    s.damage = boostInt(b.damage, s.damage, am);
    s.projectiles = boostInt(b.projectiles, s.projectiles, am);
    s.pierce = boostInt(b.pierce, s.pierce, am);
    s.defense = Math.min(0.85, boost(b.defense, s.defense, am));
  }

  s.weapon = wep;
  s.ship = def;
  /** 스킬·드래프트 무기 발당 공식용 공격력(PlayerStats.SkillDamage). */
  s.skillDamage = s.damage * 0.118;
  return s;
}

/** 어느 층이 얼마를 보탰나 — 패널의 "기여도" 표가 이걸 그린다. */
export function breakdown(lo) {
  const layers = [
    ['요원 기본', { ...lo, shipLevel: 0, accountLevel: 1, research: [0, 0, 0, 0, 0, 0],
                  equip: { Weapon: null, Body: null, Core: null, Engine: null } }],
    ['+ 요원 레벨', { ...lo, accountLevel: 1, research: [0, 0, 0, 0, 0, 0],
                  equip: { Weapon: null, Body: null, Core: null, Engine: null } }],
    ['+ 장비', { ...lo, accountLevel: 1, research: [0, 0, 0, 0, 0, 0] }],
    ['+ 연구', { ...lo, accountLevel: 1 }],
    ['+ 계정 레벨', lo],
  ];
  return layers.map(([name, l]) => ({ name, stats: build(l) }));
}
