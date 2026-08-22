// 웨이브 엔진 — EnemySpawner 의 예산 드립 모델을 그대로 옮겼다.
//
// 핵심 불변식 하나만 기억하면 된다: **한 웨이브가 스폰하는 총 마릿수는 count 로 고정**이다.
// 초당 count/dur 비율로 흘려보내고, 동시 상한(cap)에 막히면 스폰이 밀릴 뿐 예산은 안 깎인다.
// 이 불변식이 있어야 "이 런에서 셀이 몇 개 나오나"를 계산으로 정할 수 있다 — 정비 상점 물가의 근거다.
//
// 게임에 있는데 여기 없는 것(의도적으로 뺀 것):
//   편대 진입 · 따돌림 방지 재배치 · 스페셜 승격 타이머 · 결투 패턴 · 종말 계급.
//   전부 "누가 언제 나오나"를 흔드는 연출 장치라, 수치를 재는 도구에서는 잡음이 된다.
//   보스/지휘관은 ObjectiveDirector 몫이라 여기서는 웨이브 타입만 알려 주고 스폰은 run.js 가 한다.
import * as B from './balance.js';
import { ARCH } from './defs.js';

export const SPEED_TUNE = 0.8415;    // Enemy.SpeedTune
export const SIZE_MUL = 0.425;       // EnemyArchetype.SizeMul
export const CONTACT_BASE = 4;       // Enemy.Configure: contactDamage = 4 × dmgMul × 웨이브 × 행성
export const CONTACT_TICK = 0.15;    // Enemy.ContactTick
export const CONTACT_DPS_MUL = 2.0;  // Enemy.ContactDpsMul
export const CONTACT_RAMP_MAX = 2.2, CONTACT_RAMP_TIME = 3, CONTACT_BREAK = 0.4;
export const BASE_IFRAME = 0.3;      // PlayerHealth.BaseIFrame

const LOOP_TAIL = 5;
const RAMP_LO = 0.85, RAMP_HI = 1.15;
const MAX_TANKER = 10, ELITE_TANKER_CAP = 18;
const HEAVY = new Set(['Brute', 'Bulwark', 'Carrier', 'Juggernaut']);
const PLANETS_DEVELOPED = 6;         // PlanetDef.Developed — 이 아래는 전부 실내/지상 맵

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v) => clamp(v, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;

/** 접촉 지속 → 피해 배율(PlayerHealth.RampMul). 순수 함수라 그대로 검사한다. */
export const rampMul = (streak) => 1 + (CONTACT_RAMP_MAX - 1) * clamp01(streak / CONTACT_RAMP_TIME);

/** 적 원형 = 코드 필드 + balance.json 오버레이(EnemyArchetype.Get 규칙 그대로). */
export function arch(kind) {
  const a = { ...(ARCH[kind] || ARCH.Mid) };
  const c = B.enemy(kind);
  if (c) {
    a.hpMul = c.hpMul; a.speedMul = c.speedMul; a.dmgMul = c.dmgMul;
    a.xp = c.xp; a.coin = c.coin;
    if (c.score >= 0) a.score = c.score;
  }
  return a;
}

/** 스프라이트 원본 px — 월드 크기 계산에 들어간다. 실측: special 128, 보스 256, 나머지 64. */
export const spritePx = (suffix) => (suffix === 'special' ? 128 : suffix === '' ? 256 : 64);
/** 월드 폭 = (px ÷ 32) × scale × SizeMul. */
export const worldSize = (a) => (spritePx(a.suffix) / 32) * a.scale * SIZE_MUL;

export class WaveEngine {
  /**
   * @param opts.planet 0-based 행성 인덱스
   * @param opts.endless 무한 모드면 표 끝에서 뒤 5칸을 순환한다
   * @param opts.spawn(kind, stats) 실제 스폰 콜백 — 좌표는 호출자가 정한다
   * @param opts.aliveCount() 전투 중인 적 수(보스·구조물 제외)
   */
  constructor(opts) {
    this.o = opts;
    this.reset();
  }

  reset() {
    this.waveIdx = -1;
    this.waveTime = 0;
    this.waveRemaining = 0;
    this.spawnAcc = 0;
    this.skillAdj = 1;
    this.hpMul = 1; this.dmgMul = 1; this.speedMul = 1;
    this.running = false;
    this.bossPending = false;
    this.finished = false;
  }

  // ── 표 조회 ───────────────────────────────────────────────────────────
  get table() { return B.waves(); }
  get total() { return this.table.length; }

  /** 캠페인은 표 끝에서 멈추고, 무한은 뒤 5칸을 순환한다(EnemySpawner.TableIdx). */
  tableIdx(idx) {
    const t = this.table;
    if (!t || !t.length || idx < 0) return -1;
    if (idx < t.length) return idx;
    if (!this.o.endless) return -1;
    const tail = Math.min(LOOP_TAIL, t.length);
    return t.length - tail + ((idx - t.length) % tail);
  }

  get cur() {
    const i = this.tableIdx(this.waveIdx);
    return i < 0 ? null : this.table[i];
  }

  /** 행성0(연구소 A동)은 런 길이가 60%다 — 첫 맵을 짧게 도는 게 게임 규칙이다. */
  get runLenMul() { return !this.o.endless && this.o.planet === 0 ? 0.6 : 1; }
  waveDur(w) { return Math.max(1, w.dur * this.runLenMul); }
  waveCount(w) { return Math.max(1, Math.round(w.count * this.runLenMul)); }

  /** 홀수 행성은 밀도가 20% 높다(EnemySpawner.DensityMul). */
  get densityMul() { return this.o.planet % 2 === 1 && this.o.planet < PLANETS_DEVELOPED ? 1.2 : 1; }

  get waveNo() { return this.waveIdx + 1; }
  get timeLeft() { const w = this.cur; return w ? Math.max(0, this.waveDur(w) - this.waveTime) : 0; }
  get hasNext() { return this.o.endless || this.waveIdx + 1 < this.total; }

  // ── 진행 ──────────────────────────────────────────────────────────────
  begin() { this.reset(); this.running = true; this.startWave(0); }

  startWave(idx) {
    const ti = this.tableIdx(idx);
    if (ti < 0) { this.finished = true; this.running = false; return; }
    this.waveIdx = idx;
    this.waveTime = 0;
    this.spawnAcc = 0;
    this.waveRemaining += this.waveCount(this.table[ti]);   // 이월분 위에 얹는다 = 런 총량 보존
    this.recalcScale();
    const w = this.table[ti];
    this.bossPending = w.type === 'boss' || w.type === 'cmd';
    this.o.onWaveStart?.(this.waveNo, w);
    // 서지 = 웨이브 첫머리에 한 무리가 통째로 밀려 들어온다. 예산에서 나가므로 총량은 그대로다.
    if (w.surge > 0 && this.waveRemaining >= w.surge) {
      this.waveRemaining -= w.surge;
      const heavyMul = 0.05;   // 첫머리라 진행도 0 = 탱커는 거의 안 섞인다
      for (let i = 0; i < w.surge; i++) {
        const k = this.pickKind(w.comp, heavyMul);
        this.o.spawn(k, this.statsFor(k), { surge: true });
      }
    }
  }

  /** 웨이브 종료 — 잔존 적 수로 실력 보정을 갱신하고 상점 차례를 넘긴다. */
  endWave() {
    const w = this.cur;
    if (!w) return;
    const s = B.D().spawn;
    const leftover = this.o.aliveCount();
    if (leftover === 0) this.skillAdj *= s.skillAdjUp;
    else if (leftover >= this.waveCount(w) * s.skillAdjLeftoverFrac) this.skillAdj *= s.skillAdjDown;
    this.skillAdj = clamp(this.skillAdj, s.skillAdjMin, s.skillAdjMax);
    this.bossPending = false;
    this.running = false;   // 상점이 열린다. 재개는 next() 가 한다.
    this.o.onWaveEnd?.(this.waveNo, w);
  }

  /** 상점을 닫고 다음 웨이브로. 표 끝이면 클리어. */
  next() {
    if (!this.hasNext) { this.finished = true; this.o.onCleared?.(); return; }
    this.running = true;
    this.startWave(this.waveIdx + 1);
  }

  /** 보스 격파 통보(ObjectiveDirector.ResolveBossWave). */
  resolveBoss() { if (this.bossPending) { this.bossPending = false; this.endWave(); } }

  recalcScale() {
    const s = B.D().spawn, w = this.cur;
    const hand = w && w.hpMul > 0 ? w.hpMul : 1;
    this.hpMul = Math.pow(s.waveHpGrowth, Math.max(0, this.waveIdx)) * this.skillAdj * hand;
    this.dmgMul = Math.pow(s.waveDmgGrowth, Math.max(0, this.waveIdx));
    this.speedMul = w && w.speedMul > 0 ? w.speedMul : 1;
  }

  // ── 적 기본치 ─────────────────────────────────────────────────────────
  baseHp() {
    const s = B.D().spawn, p = B.planet(this.o.planet);
    return s.baseHpConst * p.difficulty * s.baseHpDiffScale * this.hpMul;
  }

  baseSpeed() {
    const s = B.D().spawn, diff = B.planet(this.o.planet).difficulty;
    return s.baseSpeedConst * lerp(1, s.baseSpeedDiffMax, clamp01((diff - 1) / 1.2)) * this.speedMul;
  }

  /** 행성 피해 배수(EnemySpawner.PlanetDmgMul) — 런 중 불변. */
  get planetDmgMul() { return B.planet(this.o.planet).dmgScale; }

  /** 이 종을 지금 스폰하면 어떤 수치가 되나. 스폰과 미리보기 표가 같은 함수를 읽는다. */
  statsFor(kind) {
    const a = arch(kind);
    return {
      kind,
      arch: a,
      maxHp: this.baseHp() * a.hpMul,
      speed: this.baseSpeed() * a.speedMul * SPEED_TUNE,
      contactDamage: CONTACT_BASE * a.dmgMul * this.dmgMul * this.planetDmgMul,
      size: worldSize(a),
      knockResist: a.knockResist,
      ranged: !!a.ranged,
      fireInterval: a.fireInterval,
      cell: a.cell, coin: a.coin, score: a.score, xp: a.xp,
      suffix: a.suffix,
    };
  }

  // ── 편성 추첨 ─────────────────────────────────────────────────────────
  heavyWeight(comp) {
    if (!comp || !comp.length) return 0;
    let heavy = 0, all = 0;
    for (const c of comp) { all += c.w; if (HEAVY.has(c.kind)) heavy += c.w; }
    return all > 0 ? heavy / all : 0;
  }

  pickKind(comp, heavyMul) {
    const wgt = (c) => c.w * (heavyMul !== 1 && HEAVY.has(c.kind) ? heavyMul : 1);
    let total = 0;
    for (const c of comp) total += wgt(c);
    let r = Math.random() * total;
    for (const c of comp) { r -= wgt(c); if (r < 0) return c.kind; }
    return comp[0].kind;
  }

  // ── 매 프레임 ─────────────────────────────────────────────────────────
  update(dt) {
    if (!this.running) return;
    const w = this.cur;
    if (!w) return;
    // 최종보스 웨이브는 보스 단독이다 — 드립도 밀도 바닥도 없다.
    if (w.type === 'boss') { this.waveTime += dt; return; }

    const dur = this.waveDur(w);
    this.waveTime += dt;
    const prog = clamp01(this.waveTime / dur);
    // 웨이브 안에서도 오르막이다. 밀도는 0.85 → 1.15, 탱커는 진행도 ×2(초반엔 거의 안 나온다).
    // 둘 다 평균 1이라 총 마릿수 count 는 그대로다.
    const ramp = RAMP_LO + (RAMP_HI - RAMP_LO) * prog;
    const heavyMul = Math.max(0.05, 2 * prog);
    this.spawnAcc += (this.waveCount(w) / dur) * ramp * dt;

    // 밀도 바닥: 빨리 죽일수록 빨리 채워진다. 이게 없으면 강한 빌드일수록 화면이 빈다.
    const dm = this.densityMul;
    const combat = this.o.aliveCount();
    const deficit = Math.max(0, w.min * dm - combat);
    if (this.spawnAcc < deficit) this.spawnAcc = deficit;

    const cap = Math.min(Math.round(w.cap * dm), Math.round(B.D().spawn.maxAlive * (dm > 1 ? 1.1 : 1)));
    const guard = Math.max(1, B.D().spawn.refillBatch);
    // 탱커 동시 상한은 그 웨이브가 의도한 탱커 수에서 역산한다(고정 10이면 후반 편성이 무너진다).
    const solo = w.comp && w.comp.length === 1;
    const wantTanker = Math.round(w.min * this.heavyWeight(w.comp) * 1.25);
    const tankerCap = solo ? Infinity
      : Math.max(w.type === 'elite' ? ELITE_TANKER_CAP : MAX_TANKER, wantTanker);

    let spawned = 0;
    while (this.spawnAcc >= 1 && this.waveRemaining > 0 && combat + spawned < cap && spawned < guard) {
      let k = this.pickKind(w.comp, heavyMul);
      // 상한에 막히면 그 자리를 스웜으로 메운다. 예산은 어차피 까이므로 버리면 총량이 조용히 줄어든다.
      if (HEAVY.has(k) && this.o.heavyAlive() >= tankerCap) k = 'Swarm';
      this.o.spawn(k, this.statsFor(k));
      this.spawnAcc -= 1; this.waveRemaining--; spawned++;
    }
    // cap 이 오래 막혔다 풀릴 때의 덤프 방지. 단 바닥 부족분은 면제한다.
    const accCap = Math.max(4, deficit);
    if (this.spawnAcc > accCap) this.spawnAcc = accCap;

    // 종료: 시간이 다 됐거나, 예산을 다 쓰고 필드까지 비웠거나(쓸어버린 보상 = 이른 상점).
    const swept = this.waveRemaining <= 0 && combat === 0;
    if (!this.bossPending && (this.waveTime >= dur || swept)) this.endWave();
  }

  /** 이 런의 총 스폰 예산 — 경제 계산의 분모다. */
  totalBudget() {
    return this.table.reduce((n, w) => n + this.waveCount(w), 0);
  }
}
