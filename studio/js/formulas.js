// 레벨별 수치 — 게임 코드(BuildSkills.cs · BuildSkillAuras.cs · LevelPlan.cs · WeaponBase.cs)의 JS 미러.
//
// 원본은 언제나 C# 쪽이다. 여기 값은 사본이라 게임이 바뀌면 조용히 어긋날 수 있고,
// 그걸 막으려고 Unity 메뉴 `Tools > 스킬 랩 > 수치 내보내기` 가 진짜 게임 코드를 실행해
// data/skills_unity.json 을 만든다. 툴은 그 파일이 있으면 셀마다 이 미러와 대조해서
// 다른 칸을 붉게 표시한다 — 어긋남이 보이지 않게 쌓이는 일이 이 도구에서 제일 위험하다.
//
// 사본 범위(그 외 값은 전부 여기서 파생):
//   WeaponBase.GlobalCdMul 0.8 · LevelCdStep 0.96 · BuildSkills.WeaponMaxLevel 7
//   PlayerStats.SkillDamage = damage x 0.118

export const MAX_LEVEL = 7;          // BuildSkills.WeaponMaxLevel (액티브 스킬)
export const WEAPON_MAX_LEVEL = 8;   // WeaponBase 파생 7종은 만렙이 하나 더 높다
export const GLOBAL_CD_MUL = 0.8;
export const LEVEL_CD_STEP = 0.96;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;

/** BuildSkills.Lerp5 — 분모 7 고정(만렙이 곡선 끝에 못 닿게 하는 의도적 여백). */
export const lerp5 = (level, a, b) => lerp(a, b, clamp01((level - 1) / 7));

/** WeaponBase.LevelCdMul — 전 액티브 공통 레벨 쿨 단축. */
export const levelCdMul = (lv) => GLOBAL_CD_MUL * Math.pow(LEVEL_CD_STEP, Math.max(0, lv - 1));

// ── LevelPlan ────────────────────────────────────────────────────────────
// plan[i] = 레벨 (i+2)에서 오르는 축 인덱스. 길이 = 만렙 - 1.
export const planAxis = (plan, level) => plan[Math.min(Math.max(level - 2, 0), plan.length - 1)];
export const planGain = (labels, plan, level) => (level <= 1 ? '' : labels[planAxis(plan, level)]);

export function bumps(plan, axis, level) {
  let n = 0;
  for (let i = 0; i < plan.length && i + 2 <= level; i++) if (plan[i] === axis) n++;
  return n;
}
export const totalBumps = (plan, axis) => bumps(plan, axis, plan.length + 1);

/** 그 축 기준 실효 레벨. Lv1 = 1, 만렙 = plan.length+1. */
export function eff(plan, axis, level) {
  const total = totalBumps(plan, axis);
  if (total <= 0) return 1;
  return 1 + plan.length * (bumps(plan, axis, level) / total);
}

/** 개수형 축(투사체 수·설치 수): lo(Lv1) → hi(만렙)를 오른 횟수만큼 정수로 나눠 올린다. */
export function steps(plan, axis, level, lo, hi) {
  const total = totalBumps(plan, axis);
  if (total <= 0) return lo;
  return lo + Math.floor((hi - lo) * (bumps(plan, axis, level) / total) + 0.5);
}

// ── 레벨 축 계획(BuildSkills 상단 표 그대로) ──────────────────────────────
export const PLAN = {
  Explode:     { ax: ['공격력 증가', '쿨타임 감소'], pl: [0, 1, 0, 1, 0, 1] },
  Split:       { ax: ['투사체 증가', '공격력 증가', '쿨타임 감소'], pl: [0, 1, 2, 0, 1, 2] },
  Chain:       { ax: ['연쇄 수 증가', '공격력 증가', '쿨타임 감소'], pl: [0, 1, 2, 0, 1, 2] },
  FireField:   { ax: ['공격력 증가', '공격 범위 증가', '쿨타임 감소'], pl: [0, 1, 2, 0, 1, 2] },
  FrostAura:   { ax: ['빙결 시간 증가', '쿨타임 감소'], pl: [0, 1, 0, 1, 0, 1] },
  Orbital:     { ax: ['공격 범위 증가', '쿨타임 감소'], pl: [0, 1, 0, 1, 0, 1] },
  Mine:        { ax: ['공격력 증가', '살포 범위 증가', '쿨타임 감소'], pl: [0, 1, 2, 0, 1, 2] },
  MineBreak:   { ax: ['공격력 증가', '폭발 범위 증가', '쿨타임 감소'], pl: [0, 1, 2, 0, 1, 2] },
  Gravity:     { ax: ['공격 범위 증가', '지속 시간 증가', '쿨타임 감소'], pl: [0, 1, 2, 0, 1, 2] },
  Pulse:       { ax: ['공격 범위 증가', '쿨타임 감소'], pl: [0, 1, 0, 1, 0, 1] },
  Timeslow:    { ax: ['지속 시간 증가', '감속 강화', '쿨타임 감소'], pl: [0, 1, 2, 0, 1, 2] },
  Repair:      { ax: ['회복량 증가'], pl: [0, 0, 0, 0, 0, 0] },
  ReflectBall: { ax: ['공격력 증가', '동시 사출과 지속 증가', '쿨타임 감소'], pl: [0, 1, 2, 0, 1, 2] },
  IonGrenade:  { ax: ['공격력 증가', '웅덩이 범위와 감속 강화', '쿨타임 감소'], pl: [0, 1, 2, 0, 1, 2] },
  CloneDroid:  { ax: ['유지 시간 증가', '복제 화력과 수 증가', '쿨타임 감소'], pl: [0, 1, 2, 0, 1, 2] },
  Sentry:      { ax: ['공격력과 연사 증가', '동시 설치와 유지 증가', '쿨타임 감소'], pl: [0, 1, 2, 0, 1, 2] },
};

const E = (id, axis, l) => eff(PLAN[id].pl, axis, l);
const S = (id, axis, l, lo, hi) => steps(PLAN[id].pl, axis, l, lo, hi);

/** 진화형 쿨 배수 — 진화가 쿨을 없애는 방향이면 안 된다는 규칙(유저 2026-07-31). */
export const EVO_CD_MUL = 1.8;

/**
 * 스킬 피해 기준값. PlayerStats.SkillDamage = damage x 0.118, 여기에 파워코어 배수.
 * BuildSkills.BaseDmg 는 1 이 하한이다.
 */
export const baseDmg = (agentDamage, damageMul = 1) => Math.max(1, agentDamage * 0.118 * damageMul);

// ── 스킬별 공식 ───────────────────────────────────────────────────────────
// 함수 이름은 C# 쪽과 1:1 이다. 대조할 때 grep 한 번으로 찾으라고 일부러 맞췄다.
export const F = {
  // 관통 로켓
  explodeInterval: (l, evo) => { const e = E('Explode', 1, l); return lerp5(e, 5.8, 3.4) * (evo ? EVO_CD_MUL : 1) * levelCdMul(e); },
  explodeDamage: (l, d) => Math.max(1, Math.round(baseDmg(d) * (1.4 + 0.75 * E('Explode', 0, l)))),
  explodeLen: (l) => 0.72 + 0.05 * l,
  explodeSpeed: () => 4.2,
  explodeLife: () => 3.2,

  // 분열탄
  splitInterval: (l, evo) => { const e = E('Split', 2, l); return lerp5(e, 4.0, 2.2) * (evo ? EVO_CD_MUL : 1) * levelCdMul(e); },
  splitFrags: (l) => S('Split', 0, l, 5, 20),
  splitRange: (l) => 2.4 + 0.2625 * E('Split', 0, l),
  splitDamage: (l, d) => baseDmg(d) * 0.9 * (1.4 + 0.5 * E('Split', 1, l)),
  poolLife: () => 2.0,

  // 라이트닝 체인
  chainInterval: (l, evo) => { const e = E('Chain', 2, l); return Math.max(3.2, 10.5 - 1.05 * (e - 1)) * (evo ? EVO_CD_MUL : 1) * levelCdMul(e); },
  chainHops: (l, storm) => S('Chain', 0, l, 3, 11) + (storm ? 1 : 0),
  chainShots: (storm) => (storm ? 3 : 1),
  chainDamage: (l, d) => baseDmg(d) * 0.9 * (2.5 + 1.5 * E('Chain', 1, l)),
  chainHopDelay: () => 0.05,

  // 플라즈마 필드
  fireRadius: (l, evo) => (1.173 + 0.2329 * E('FireField', 1, l)) * (evo ? 1.08 : 1),
  fireDps: (l, evo) => (4.62 + 4.62 * E('FireField', 0, l)) * (evo ? 1.12 : 1),
  fireDuration: (l, evo) => (2.2 + 0.2 * E('FireField', 1, l)) * (evo ? 1.15 : 1),
  fireRest: (l, evo) => Math.max(4.5, 9 - 0.5 * E('FireField', 2, l)) * (evo ? 1.5 : 1),

  // 빙결 레이저
  frostCooldown: (l, evo) => Math.max(1.7, 4.2 - 0.3125 * E('FrostAura', 1, l)) * (evo ? 1.6 : 1),
  frostFreeze: (l, evo) => (1.6 + 0.325 * E('FrostAura', 0, l)) * 1.6 * (evo ? 1.12 : 1),
  frostWidth: (l, evo) => (0.7 + 0.0875 * E('FrostAura', 0, l)) * (evo ? 1.35 : 1),
  frostRange: (l) => 9 + 0.75 * E('FrostAura', 0, l),
  frostSpread: () => 2.2,

  // 궤도 위성포
  orbitalInterval: (l) => { const e = E('Orbital', 1, l); return lerp5(e, 8.0, 3.6) * levelCdMul(e); },
  orbitalWidth: (l) => 1.10 + 0.16 * E('Orbital', 0, l),
  orbitalDamage: (l, d) => Math.max(1, Math.round(baseDmg(d) * (1.5 + 0.6 * E('Orbital', 0, l)))),
  orbitalTelegraph: () => 0.85,
  orbitalBeamDur: () => 0.55,

  // 광역 살포 지뢰
  mineInterval: (l) => { const e = E('Mine', 2, l); return lerp5(e, 4.0, 2.2) * levelCdMul(e); },
  mineMax: (l) => S('Mine', 1, l, 3, 6),
  mineThrow: (l) => 2.8 + 0.30 * E('Mine', 1, l),
  mineDamage: (l, d) => Math.max(1, Math.round(baseDmg(d) * (0.60 + 0.22 * E('Mine', 0, l)))),
  mineRadius: (l) => 1.45 + 0.08 * E('Mine', 0, l),
  mineSense: () => 0.6,

  // 장갑 지뢰
  breakInterval: (l) => { const e = E('MineBreak', 2, l); return lerp5(e, 10.0, 6.5) * levelCdMul(e); },
  breakMax: () => 1,
  breakDamage: (l, d) => Math.max(1, Math.round(baseDmg(d) * (6.0 + 2.6 * E('MineBreak', 0, l)))),
  breakRadius: (l) => 1.70 + 0.11 * E('MineBreak', 1, l),
  breakFuse: () => 5.0,
  breakSense: () => 0.7,

  // 중력장 우물
  gravityInterval: (l) => { const e = E('Gravity', 2, l); return lerp5(e, 11, 6.5) * levelCdMul(e); },
  gravityDuration: (l) => 2.4 + 0.15 * E('Gravity', 1, l),
  gravityRadius: (l) => 2.2 + 0.12 * E('Gravity', 0, l),
  gravityDps: (l, d) => baseDmg(d) * (0.4 + 0.15 * E('Gravity', 0, l)),
  gravityBurst: (l, d) => Math.max(1, Math.round(baseDmg(d) * (0.7 + 0.25 * E('Gravity', 0, l)))),

  // 충격 펄스
  pulseInterval: (l) => { const e = E('Pulse', 1, l); return lerp5(e, 8, 4.5) * levelCdMul(e); },
  pulseRadius: (l) => 3.2 + 0.15 * E('Pulse', 0, l),
  pulseDamage: (l, d) => Math.max(1, Math.round(baseDmg(d) * (0.25 + 0.10 * E('Pulse', 0, l)))),

  // 시간 지연 펄스
  timeslowInterval: (l) => { const e = E('Timeslow', 2, l); return lerp5(e, 14, 9) * levelCdMul(e); },
  timeslowDuration: (l) => 1.8 + 0.25 * E('Timeslow', 0, l),
  timeslowFactor: (l) => Math.max(0.18, 0.30 - 0.015 * E('Timeslow', 1, l)),

  // 야전 수복 장치
  repairPercent: (l) => 0.06 + 0.02 * E('Repair', 0, l),

  // 리플랙션볼
  reflectBallInterval: (l) => { const e = E('ReflectBall', 2, l); return lerp5(e, 7.0, 4.0) * levelCdMul(e); },
  reflectBallMax: (l) => S('ReflectBall', 1, l, 1, 3),
  reflectBallLife: (l) => lerp5(E('ReflectBall', 1, l), 6, 10),
  reflectBallDamage: (l, d) => baseDmg(d) * lerp5(E('ReflectBall', 0, l), 1.9, 5.0),
  reflectBallTick: () => 0.35,
  reflectBallSpeed: () => 7.5,

  // 이온 수류탄
  ionInterval: (l) => { const e = E('IonGrenade', 2, l); return lerp5(e, 6.0, 3.2) * levelCdMul(e); },
  ionRadius: (l) => lerp5(E('IonGrenade', 1, l), 1.5, 2.4),
  ionLife: (l) => lerp5(E('IonGrenade', 1, l), 4, 6),
  ionDps: (l, d) => baseDmg(d) * lerp5(E('IonGrenade', 0, l), 1.6, 4.3),
  ionSlow: (l) => lerp5(E('IonGrenade', 1, l), 0.75, 0.60),
  ionFlight: () => 0.75,

  // 복제 안드로이드
  cloneInterval: (l) => { const e = E('CloneDroid', 2, l); return lerp5(e, 40, 26) * levelCdMul(e); },
  cloneDuration: (l) => lerp5(E('CloneDroid', 0, l), 6, 12),
  cloneRatio: (l) => lerp5(E('CloneDroid', 1, l), 0.50, 0.85),
  cloneMax: (l) => S('CloneDroid', 1, l, 1, 2),
  cloneFollowDelay: () => 0.7,

  // 자동 조준 포탑
  sentryInterval: (l) => { const e = E('Sentry', 2, l); return lerp5(e, 8.0, 4.5) * levelCdMul(e); },
  sentryMax: (l) => S('Sentry', 1, l, 1, 3),
  sentryLife: (l) => lerp5(E('Sentry', 1, l), 8, 12),
  sentryFireInterval: (l) => lerp5(E('Sentry', 0, l), 0.55, 0.35),
  sentryDamage: (l, d) => baseDmg(d) * lerp5(E('Sentry', 0, l), 1.25, 3.35),
  sentryRange: (l) => lerp5(E('Sentry', 0, l), 5.0, 6.2),
};

// ── 드래프트 무기 7종 ─────────────────────────────────────────────────────
// BuildSkills 액티브와 달리 WeaponBase 파생이고 만렙이 8이다. 계수는 balance.json weapons 블록.
export const WPLAN = {
  BombWeapon:         { ax: ['공격력 증가', '폭발 범위 증가', '쿨타임 감소'], pl: [0, 1, 2, 0, 1, 2, 0] },
  HomingWeapon:       { ax: ['투사체 증가', '쿨타임 감소'], pl: [0, 1, 0, 1, 0, 1, 0] },
  OrbitalWeapon:      { ax: ['칼날 수 증가', '공격력 증가', '쿨타임 감소'], pl: [0, 1, 2, 0, 1, 2, 0] },
  DroneWeapon:        { ax: ['드론 수 증가', '공격력 증가', '공격 속도 증가', '쿨타임 감소'], pl: [0, 1, 2, 3, 1, 2, 0] },
  BoomerangWeapon:    { ax: ['투사체 증가', '공격력 증가', '사거리 증가', '쿨타임 감소'], pl: [0, 1, 2, 3, 1, 2, 3] },
  SupportDroneWeapon: { ax: ['회복량 증가', '쿨타임 감소'], pl: [0, 1, 0, 1, 0, 1, 0] },
  CoreShieldSkill:    { ax: ['지속 시간 증가', '쿨타임 감소'], pl: [0, 1, 0, 1, 0, 1, 0] },
};

const W = (id, axis, l) => eff(WPLAN[id].pl, axis, l);
const WS = (id, axis, l, lo, hi) => steps(WPLAN[id].pl, axis, l, lo, hi);
const WB = (id, axis, l) => bumps(WPLAN[id].pl, axis, l);

/** balance.json weapons 블록에서 이 도구가 쓰는 값만. 게임이 이 표를 고치면 여기도 고친다. */
export const WBAL = {
  bombCdBase: 12.5, bombCdSlope: 0.7688, bombCdMin: 6.4, bombCdEvoBase: 13.2, bombCdEvoMin: 7.2,
  bombDmgMul: 5.4, bombDmgSlope: 11.25, bombEvoDmgMul: 1.35,
  homingCdBase: 2.2, homingCdSlope: 0.2, homingCdMin: 0.5, homingCdEvoBase: 2.6, homingCdEvoMin: 1.1,
  droneCdBase: 0.9, droneCdSlope: 0.075, droneCdMin: 0.28, droneCdEvoBase: 0.95, droneCdEvoMin: 0.3,
  orbitalRadiusBase: 1.35, orbitalRadiusSlope: 0.1, orbitalRadiusEvoBonus: 0.35,
  boomCdBase: 3.6, boomCdSlope: 0.1625, boomCdMin: 2.1, boomRange: 3, boomSpeed: 10,
};

const skillDmg = (d) => Math.max(1, d * 0.118);

export const WF = {
  // 강화 로켓
  bombInterval: (l, evo) => {
    const e = W('BombWeapon', 2, l);
    return (evo ? Math.max(WBAL.bombCdEvoMin, WBAL.bombCdEvoBase - e * WBAL.bombCdSlope)
                : Math.max(WBAL.bombCdMin, WBAL.bombCdBase - e * WBAL.bombCdSlope)) * levelCdMul(e);
  },
  bombRadius: (l, evo) => (1.25 + W('BombWeapon', 1, l) * 0.10625 + (evo ? -0.1 : 0)) * 1.2,
  bombCount: (evo) => (evo ? 2 : 1),
  bombDamage: (l, evo, d) => Math.round(Math.max(1, skillDmg(d) * WBAL.bombDmgMul + W('BombWeapon', 0, l) * WBAL.bombDmgSlope) * (evo ? WBAL.bombEvoDmgMul : 1)),

  // 유도 미사일
  homingInterval: (l, evo) => {
    const e = W('HomingWeapon', 1, l);
    return (evo ? Math.max(WBAL.homingCdEvoMin, WBAL.homingCdEvoBase - e * WBAL.homingCdSlope)
                : Math.max(WBAL.homingCdMin, WBAL.homingCdBase - e * WBAL.homingCdSlope)) * levelCdMul(e);
  },
  homingShots: (l, evo) => WS('HomingWeapon', 0, l, 1, 6) + (evo ? 1 : 0),
  homingChain: (l, evo) => (evo ? 0.18 : WB('HomingWeapon', 0, l) >= 3 ? 0.20 : 0),
  homingDamage: (l, evo, d) => Math.max(1, Math.round(skillDmg(d) + 1)),

  // 궤도 칼날
  bladeCount: (l, evo) => Math.min(evo ? 7 : 5, WS('OrbitalWeapon', 0, l, 1, 5) + (evo ? 2 : 0)),
  bladeRest: (l, evo) => { const e = W('OrbitalWeapon', 2, l); return Math.max(0.6, 3.6 - 0.375 * e) * (evo ? 0.7 : 1) * levelCdMul(e); },
  bladeRadius: (l, evo) => WBAL.orbitalRadiusBase + WBAL.orbitalRadiusSlope * W('OrbitalWeapon', 0, l) + (evo ? WBAL.orbitalRadiusEvoBonus : 0),
  bladeSpeed: (l, evo) => (130 + 18.75 * W('OrbitalWeapon', 1, l)) * (evo ? 1.35 : 1),   // 도/초
  bladeScale: (evo) => (evo ? 0.5 : 0.34),
  bladeDamage: (l, evo, d) => Math.round((d + W('OrbitalWeapon', 1, l) * 1.875) * 1.8 * (evo ? 1.6 : 1)),

  // 공격형 드론 알파
  droneCount: (l, evo) => Math.min(3, WS('DroneWeapon', 0, l, 1, 3) + (evo ? 2 : 0)),
  droneFireInterval: (l, evo) => {
    const e = W('DroneWeapon', 2, l);
    return (evo ? Math.max(WBAL.droneCdEvoMin, WBAL.droneCdEvoBase - e * WBAL.droneCdSlope)
                : Math.max(WBAL.droneCdMin, WBAL.droneCdBase - e * WBAL.droneCdSlope)) * 0.7 * levelCdMul(e);
  },
  droneDeploy: (l) => 3.4 + 0.45 * W('DroneWeapon', 3, l),
  droneRest: (l) => { const e = W('DroneWeapon', 3, l); return Math.max(1.5, 4.6 - 0.35 * e) * levelCdMul(e); },
  droneRange: (l) => Math.min(8, 3.2 + 0.625 * W('DroneWeapon', 0, l)),
  droneDamage: (l, evo, d) => Math.max(1, Math.round((skillDmg(d) + W('DroneWeapon', 1, l)) * (evo ? 1.62 : 1.4))),

  // 네온 부메랑
  boomInterval: (l) => { const e = W('BoomerangWeapon', 3, l); return Math.max(WBAL.boomCdMin, WBAL.boomCdBase - e * WBAL.boomCdSlope) * levelCdMul(e); },
  boomCount: (l, evo) => WS('BoomerangWeapon', 0, l, 1, 2) + (evo ? 1 : 0),
  boomRange: (l, evo) => WBAL.boomRange + 0.4375 * W('BoomerangWeapon', 2, l) + (evo ? 1.5 : 0),
  // 커터 월드 크기(BoomerangProjectile.Spawn) — 원시 레벨을 그대로 탄다(축 보정 없음).
  boomSize: (l, evo) => 0.55 + 0.06 * l + (evo ? 0.3 : 0),
  boomDamage: (l, evo, d) => Math.max(1, Math.round((skillDmg(d) + 2.5 * W('BoomerangWeapon', 1, l)) * (evo ? 1.35 : 1))),

  // 지원형 드론 델타
  supInterval: (l) => { const e = W('SupportDroneWeapon', 1, l); return Math.max(1.6, 6 - e * 0.5625) * levelCdMul(e); },
  supHeal: (l) => 0.03 + 0.0125 * W('SupportDroneWeapon', 0, l),

  // 코어 쉴드
  shieldPeriod: (l) => Math.max(4.2, 11.6 - W('CoreShieldSkill', 1, l) * 0.92) * GLOBAL_CD_MUL,
  shieldDuration: (l) => 1.0 + W('CoreShieldSkill', 0, l) * 0.24,
};

// ── 기본 주포(MainCannonWeapon + AutoShooter) ──────────────────────────────
// 이 도구에서 화력의 절대량을 정하는 자리다. 스킬은 전부 여기서 파생된 수(SkillDamage)를 쓴다.
export const MC = {
  MAX_LV: 10,
  /** 자동사격 연사 배율(요원 fireInterval × 이 값). 클수록 느리다. */
  AUTO_FIRE_MUL: 2.0686,
  /** 발당 피해 배수 = AutoFireMul ÷ 구 단발 케이던스 5. 케이던스를 바꿔도 DPS 가 동결되는 장치다. */
  get RAPID_DMG_MUL() { return MC.AUTO_FIRE_MUL / 5; },
  /** 기본 지급 총(주포 Lv1) 발당 피해 배수. 여길 만지면 런 전체 주포 화력이 그대로 곱해진다. */
  BASE_DMG_MUL: 0.495,
  /** 사거리 배수는 레벨과 무관하게 고정이다 — 늘리면 적이 닿기 전에 녹아 밀도와 수입이 같이 죽는다. */
  RANGE_MUL: 0.56,

  barrels: (lv) => (lv >= 6 ? 6 : lv >= 3 ? 4 : 2),
  volley: (lv) => MC.barrels(lv) / 2,
  pierceBonus: (lv, evo) => (lv >= 3 ? 1 : 0) + (lv >= 6 ? 1 : 0) + (lv >= 9 ? 1 : 0) + (evo ? 2 : 0),
  damageMul: (lv, evo) =>
    Math.pow(1.2, (lv >= 3 ? 1 : 0) + (lv >= 5 ? 1 : 0) + (lv >= 7 ? 1 : 0)) * (evo ? 1.35 : 1),
  intervalMul: (lv, evo) =>
    Math.max(0.28, evo || lv >= MC.MAX_LV ? 0.44 : lv >= 8 ? 0.52 : lv >= 6 ? 0.64 : lv >= 4 ? 0.76 : lv >= 2 ? 0.88 : 1),
  thickMul: (lv, evo) => 1 + (1.60 / (MC.MAX_LV - 1)) * (Math.min(MC.MAX_LV, Math.max(1, lv)) - 1) + (evo ? 0.3 : 0),
  boltTier: (lv, evo) => (evo || lv >= 9 ? 't4' : lv >= 6 ? 't3' : lv >= 3 ? 't2' : 't1'),

  /** 발당 기본 피해(AutoShooter.ShotDamage). 크리·산포는 아직 안 걸린 값이다. */
  shotDamage: (stats, lv, evo) =>
    stats.damage * MC.RAPID_DMG_MUL * MC.BASE_DMG_MUL * (stats.weapon?.damageMul ?? 1) * MC.damageMul(lv, evo),
  /** 발사 간격(초). 요원 연사 × 자동사격 배율 × 주포 사다리. */
  interval: (stats, lv, evo) => stats.fireInterval * MC.AUTO_FIRE_MUL * MC.intervalMul(lv, evo),
  /** 한 번에 나가는 탄 수 = 총열 볼리 + (무기 동시 발사 - 1). */
  shots: (stats, lv) => MC.volley(lv) + Math.max(0, stats.projectiles - 1),
};

/**
 * 크리 판정(PlayerStats.CritF). 소수점을 살린다 — 정수 바닥값 1이 약한 탄을 끌어올려
 * 연발 무기의 DPS 가 몇 배 튀는 걸 막는다. 반환은 [피해, 크리 여부].
 */
export function critF(stats, baseDamage) {
  let v = baseDamage * 0.9 * stats.damageMul * (0.8 + Math.random() * 0.4);   // -10% 밸런스 · ±20% 산포
  const crit = Math.random() < stats.critChance;
  if (crit) v *= stats.critMult;
  return [v, crit];
}
