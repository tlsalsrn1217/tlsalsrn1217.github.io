// 전투 무대 — 게임의 좌표계·크기·회전·피해 파이프라인을 그대로 쓴다.
//
// 스킬 랩(tools/skill_lab)의 무대에서 갈라져 나왔다. 거기는 스킬 하나를 관찰하는 진열대라
// 적이 더미였지만, 여기는 실제 런이다: 적 수치는 웨이브 엔진이 주고, 플레이어는 죽고,
// 셀과 코인이 게임과 같은 규칙으로 떨어진다.
//
//   화면      1080 x 1920 (모바일 세로)
//   카메라    ortho 9 → 세로 18유닛, 가로 10.125유닛
//   1유닛     1920 / 18 = 106.667px
//   바닥      *_chunk 조각 한 장 = 월드 16유닛(LabFloor)
//   회전      적 스프라이트는 기수가 -Y(noseDown) — 게임 Enemy.cs 와 같은 규칙
//
// 적 크기도 게임 공식을 그대로 쓴다: (스프라이트 px / 32) x archetype.scale x SizeMul.
// 여기를 눈에 좋아 보이게 키우면 스킬 반경과 적 크기의 비율이 거짓말이 되고,
// 그 비율을 보려고 만든 도구라 그 순간 도구의 존재 이유가 사라진다.
import * as fx from './fx.js';
import { MC, critF } from './formulas.js';
import { rampMul, CONTACT_TICK, CONTACT_DPS_MUL, CONTACT_BREAK, BASE_IFRAME } from './waves.js';
import * as B from './balance.js';

export const W = 1080, H = 1920;
export const PPU = H / 18;                 // 106.667
export const VIEW_W = W / PPU;             // 10.125 유닛
export const VIEW_H = 18;
const CHUNK = 16;                          // 바닥 조각 한 장의 월드 크기
const SIZE_MUL = 0.425;                    // EnemyArchetype.SizeMul

/**
 * 바닥 소품. LabFloor 의 슬롯 표를 그대로 옮겼다(타일 좌표 16x16, w = 월드 폭).
 * 청크마다 같은 자리에 고정으로 서는 것도 게임과 같다. 소품이 없으면 바닥이 무늬만 남아
 * 인게임 화면과 전혀 다른 인상이 된다.
 */
const PROPS = {
  lab_chunk: [
    { s: 'lab_tank', x: 2.5, y: 2.5, w: 2.5 },
    { s: 'lab_console', x: 11.5, y: 1.0, w: 2.3 },
    { s: 'lab_console', x: 13.7, y: 1.0, w: 2.3 },
    { s: 'lab_crate', x: 12.2, y: 12.2, w: 1.4 },
    { s: 'lab_crate', x: 13.6, y: 12.2, w: 1.4 },
    { s: 'lab_crate', x: 12.2, y: 13.6, w: 1.4 },
    { s: 'lab_crate', x: 13.6, y: 13.6, w: 1.4 },
    { s: 'lab_crate', x: 15.0, y: 12.2, w: 1.4 },
    { s: 'lab_barricade', x: 12.9, y: 4.4, w: 2.875 },
    { s: 'lab_barricade', x: 4.3, y: 12.0, w: 2.875, v: true },
  ],
  dock_chunk: [
    { s: 'prop_container_a', x: 2.2, y: 2.0, w: 3.6 },
    { s: 'prop_container_b', x: 12.6, y: 2.2, w: 3.6, v: true },
    { s: 'prop_container_c', x: 3.0, y: 13.4, w: 3.6 },
    { s: 'prop_container_a', x: 11.6, y: 13.6, w: 3.6 },
    { s: 'prop_crane_leg', x: 4.9, y: 4.2, w: 1.6 },
    { s: 'prop_crane_leg', x: 14.9, y: 10.8, w: 1.6 },
    { s: 'prop_pallet', x: 10.2, y: 5.0, w: 1.3 },
    { s: 'prop_pallet', x: 1.6, y: 10.2, w: 1.3 },
    { s: 'prop_drum', x: 5.1, y: 1.0, w: 0.9 },
    { s: 'prop_drum', x: 14.9, y: 5.0, w: 0.9 },
  ],
  city_chunk: [
    { s: 'prop_bus_block', x: 2.6, y: 3.2, w: 5.0 },
    { s: 'prop_bus_block', x: 12.8, y: 12.4, w: 5.0, v: true },
    { s: 'prop_car_wreck', x: 12.4, y: 2.4, w: 2.6 },
    { s: 'prop_car_wreck', x: 3.0, y: 12.8, w: 2.6, v: true },
    { s: 'prop_kiosk', x: 4.3, y: 10.6, w: 3.0 },
    { s: 'prop_jersey', x: 11.4, y: 4.8, w: 2.8 },
    { s: 'prop_signal', x: 1.4, y: 5.4, w: 1.1 },
    { s: 'prop_signal', x: 14.6, y: 10.0, w: 1.1 },
    { s: 'prop_debris', x: 10.2, y: 14.6, w: 1.5 },
    { s: 'prop_debris', x: 5.1, y: 1.3, w: 1.5 },
  ],
  rift_chunk: [],
};

// 사막은 소품을 굽지 않고 청크 좌표 해시로 뿌린다(구우면 16유닛마다 같은 선인장이 서서 랩이 드러난다).
const DESERT_DECOR = [
  { s: 'cactus_saguaro', w: 1.70, weight: 34 },
  { s: 'cactus_barrel', w: 0.95, weight: 24 },
  { s: 'desert_rock', w: 1.15, weight: 26 },
  { s: 'desert_bush', w: 1.00, weight: 16 },
];

/** 가중 추첨. LabFloor.Pick 과 같은 규칙. */
function pickDecor(r) {
  let total = 0;
  for (const d of DESERT_DECOR) total += d.weight;
  let t = r * total;
  for (const d of DESERT_DECOR) { t -= d.weight; if (t <= 0) return d; }
  return DESERT_DECOR[DESERT_DECOR.length - 1];
}

/** LabFloor.Hash01 그대로. 같은 청크는 늘 같은 배치가 나와야 랩이 안 드러난다. */
function hash01(x, y, seed) {
  let n = ((x * 73856093) ^ (y * 19349663) ^ (seed * 83492791)) >>> 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
  n = (n ^ (n >>> 16)) >>> 0;
  return n / 4294967296;
}

// 주포 제원은 상수가 아니다 — 장착 무기(WeaponDef)와 조립된 PlayerStats 가 매 프레임 정한다.
// 총구 길이·섬광 키·탄피가 총마다 다르므로, 그림도 편성을 따라 바뀌어야 인게임과 같은 화면이 된다.
const GUN_FALLBACK = { muzzleLen: 1.94, muzzleKey: 'minigun', flashAnchor: 0.34, shellSprite: 'shell_small',
                       gunSprite: 'weapon_gun_legacy', bulletSprite: 'bullet_bolt', bulletScale: 0.44 };

// WarriorVisual 상수(전부 요원 로컬 단위, 월드로 쓰려면 AGENT_SCALE 을 곱한다)
const AGENT_SCALE = 0.28;
const PIVOT_Y = -0.44, GRIP_OFF_X = 0.53;
const RECOIL_UNITS = 0.10, RECOIL_DECAY = 7;
const HEADING_DIST = 0.61, HEADING_SIZE = 0.13;

/** 화면에 이 종만 나와도 "무거운 적"으로 읽히는 집합 — 넉백 저항과 사망 폭발 크기가 다르다. */
const HEAVY_KINDS = new Set(['Brute', 'Bulwark', 'Carrier', 'Juggernaut', 'Boss']);
const DPS_WINDOW = 3;   // 초. 짧으면 폭발 한 방에 튀고, 길면 세팅을 바꾼 티가 안 난다.

export const rotNoseUp = (dx, dy) => Math.atan2(dx, dy);
export const rotNoseDown = (dx, dy) => Math.atan2(-dx, -dy);

let uid = 1;

/**
 * 적에게 실제로 들어간 피해의 누적합. 표시용 DPS 는 이 값의 증가분을 시간으로 나눈다.
 * 계산식이 아니라 **맞은 결과**를 세는 이유: 사거리 밖·과잉피해·관통 실패가 다 반영돼야
 * 화면 숫자가 실제 체감과 같아진다.
 */
export const dmgMeter = { total: 0 };

export class Enemy {
  /**
   * @param kind EnemyKind 이름('Elite' 등)
   * @param st WaveEngine.statsFor(kind) 결과 — 체력·속도·접촉피해·보상이 전부 여기서 온다
   */
  constructor(kind, x, y, st) {
    this.id = uid++;
    this.kind = kind;
    this.x = x; this.y = y;
    this.size = st.size;
    this.maxHp = st.maxHp;
    this.hp = st.maxHp;
    this.speed = st.speed;
    this.contactDamage = st.contactDamage;
    this.knockResist = st.knockResist || 0;
    this.ranged = !!st.ranged;
    this.fireInterval = st.fireInterval || 2.3;
    this.fireT = 1 + Math.random() * this.fireInterval;
    this.suffix = st.suffix;
    this.cell = st.cell | 0;
    this.coin = st.coin | 0;
    this.score = st.score | 0;
    this.strong = HEAVY_KINDS.has(kind);
    this.boss = kind === 'Boss';
    this.seed = Math.random() * 6.28;
    this.flash = 0;
    this.slowMul = 1; this.slowT = 0;
    this.frozen = false;
    this.kx = 0; this.ky = 0;              // 넉백 속도
    this.dead = false;
    this.contactT = 0;                     // 접촉 피해 틱(Enemy.ContactTick)
  }

  get radius() { return this.size * 0.42; }

  hit(dmg, nonLethal, knockMul, from) {
    if (this.dead) return 0;
    const before = this.hp;
    this.hp -= dmg;
    if (nonLethal && this.hp < 1) this.hp = 1;
    this.flash = 0.09;
    if (from && knockMul) {
      const dx = this.x - from[0], dy = this.y - from[1];
      const d = Math.hypot(dx, dy) || 1;
      const push = 2.4 * knockMul * (1 - this.knockResist);
      this.kx += (dx / d) * push; this.ky += (dy / d) * push;
    }
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
    const dealt = before - Math.max(0, this.hp);
    dmgMeter.total += dealt;
    return dealt;
  }

  slow(mul, dur) {
    if (mul <= this.slowMul || this.slowT <= 0) { this.slowMul = mul; }
    this.slowT = Math.max(this.slowT, dur);
    this.frozen = mul <= 0.001;
  }
}

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    canvas.width = W; canvas.height = H;
    this.ppu = PPU;
    this.cam = { x: 0, y: 0 };
    // 이름은 agent 그대로 둔다 — skills.js 23종이 전부 st.agent 를 읽는다.
    this.agent = {
      x: 0, y: 0, aim: Math.PI / 2, walking: false, vx: 0, vy: 0, trail: [],
      face: [0, -1],
      hp: 100, maxHp: 100,
      fireT: 0, recoil: 0, flashT: -1,
      iframeT: 0,            // 피격 무적 잔여
      contactStreak: 0,      // 끊기지 않은 접촉 누적(피해 램프의 입력)
      lastContactAt: -999,
      dead: false,
    };
    /** 조립된 PlayerStats(meta.build). 없으면 무대가 안 돈다 — app 이 런 시작 전에 반드시 꽂는다. */
    this.stats = null;
    /** 주포 레벨/진화(정비 상점이 올린다). */
    this.cannonLv = 1; this.cannonEvo = false;
    /** 0-based 행성 — 적 스프라이트 이름(enemy_p{n}_*)과 바닥을 정한다. */
    this.planet = 0;
    this.cannonOn = true;
    this.showProps = true;
    this.godMode = false;      // 수치만 보고 싶을 때. 죽지 않는다
    this.shieldCharges = 0;    // 보급 실드 잔여(피격 1회당 1스택)
    /** 조작. 'keys' = 사람이 WASD, 'auto' = 8자 순찰(관찰용, 손 놓고 지켜볼 때) */
    this.control = 'keys';
    this.input = { x: 0, y: 0 };
    this.enemies = [];
    this.effects = [];
    this.bullets = [];       // 적 탄
    this.shots = [];         // 주포 탄
    this.shells = [];
    this.gems = [];          // 셀(구 경험치 젬)
    this.coins = [];
    this.time = 0;
    this.shakeT = 0; this.shakeAmp = 0;
    this.background = 'lab_chunk';
    this.showRanges = false;
    /** 실시간 피해량 창. reset() 이 아니라 여기 두면 판을 갈아도 최고값이 남는다 — reset 에서 비운다. */
    this.dps = { win: [], seen: dmgMeter.total, start: 0, value: 0, peak: 0, total: 0, taken: 0 };
    this.paused = false;
    /** 런 집계 훅 — run.js 가 꽂는다. 무대는 "무슨 일이 일어났나"만 알린다. */
    this.onKill = null;       // (enemy) => void
    this.onPickCell = null;   // (value) => void
    this.onPickCoin = null;   // (value) => void
    this.onPlayerDeath = null;
    this.reset();
  }

  reset() {
    this.dps = { win: [], seen: dmgMeter.total, start: 0, value: 0, peak: 0, total: 0, taken: 0 };
    this.enemies = [];
    this.effects = [];
    this.bullets = [];
    this.shots = [];
    this.shells = [];
    this.gems = [];
    this.coins = [];
    this.time = 0;
    const a = this.agent;
    a.fireT = 0; a.recoil = 0; a.flashT = -1;
    a.x = 0; a.y = 0; a.trail = []; a.vx = a.vy = 0;
    a.iframeT = 0; a.contactStreak = 0; a.lastContactAt = -999; a.dead = false;
    a.maxHp = this.stats ? this.stats.maxHP : 100;
    a.hp = a.maxHp;
    this.cam.x = 0; this.cam.y = 0;
  }

  /** 편성이 바뀌면 체력 상한도 따라간다(비율 유지 — 슬라이더를 만지다 죽지 않게). */
  applyStats(stats) {
    const a = this.agent;
    const frac = a.maxHp > 0 ? a.hp / a.maxHp : 1;
    this.stats = stats;
    a.maxHp = stats.maxHP;
    a.hp = Math.min(a.maxHp, a.maxHp * frac);
  }

  /** 행성을 갈면 바닥 청크와 적 스프라이트가 같이 바뀐다(LabFloor.Maps 표 그대로). */
  setPlanet(i) {
    this.planet = Math.max(0, Math.min(5, i | 0));
    this.background = ['lab_chunk', 'lab_chunk', 'dock_chunk', 'dock_chunk', 'city_chunk', 'city_chunk'][this.planet];
  }

  /** 웨이브 엔진이 부른다. 화면 밖 링에서 등장한다(EnemySpawner.EdgePos). */
  spawn(kind, st, opt = {}) {
    const ang = opt.angle != null ? opt.angle : Math.random() * Math.PI * 2;
    const margin = 0.6 + Math.random() * 1.8;
    const [x, y] = this.edgePos(ang, margin);
    this.enemies.push(new Enemy(kind, x, y, st));
  }

  /** 그 방위로 화면 테두리 + margin 인 지점. 세로 화면이라 원이 아니라 사각으로 잡는다. */
  edgePos(ang, margin) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const hw = VIEW_W / 2 + margin, hh = VIEW_H / 2 + margin;
    const tx = Math.abs(dx) > 1e-4 ? hw / Math.abs(dx) : 9999;
    const ty = Math.abs(dy) > 1e-4 ? hh / Math.abs(dy) : 9999;
    const t = Math.min(tx, ty);
    return [this.agent.x + dx * t, this.agent.y + dy * t];
  }

  /** 전투 중인 적 수(구조물·보스 제외 — 웨이브 밀도 계산의 분모). */
  combatAlive() {
    let n = 0;
    for (const e of this.enemies) if (!e.dead && !e.boss) n++;
    return n;
  }

  heavyAlive() {
    let n = 0;
    for (const e of this.enemies) if (!e.dead && e.strong && !e.boss) n++;
    return n;
  }

  // ── 좌표 ────────────────────────────────────────────────────────────
  toScreen(wx, wy) {
    return [W / 2 + (wx - this.cam.x) * this.ppu, H / 2 - (wy - this.cam.y) * this.ppu];
  }

  onScreen(x, y, pad = 0.6) {
    return Math.abs(x - this.cam.x) < VIEW_W / 2 + pad && Math.abs(y - this.cam.y) < VIEW_H / 2 + pad;
  }

  // ── 조회 (게임의 BuildSkills 헬퍼와 같은 규칙) ────────────────────────
  alive() { return this.enemies.filter((e) => !e.dead); }

  nearest(x, y, range = 99) {
    let best = null, bd = range * range;
    for (const e of this.alive()) {
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /** 화면 안 적 중 반경 2.2 안 이웃이 가장 많은 개체. 동률이면 가까운 쪽(게임과 동일). */
  densest(fromX, fromY) {
    const list = this.alive().filter((e) => this.onScreen(e.x, e.y));
    let best = null, bestN = -1, bestD = Infinity;
    for (const e of list) {
      let n = 0;
      for (const o of list) if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 2.2 * 2.2) n++;
      const d = (e.x - fromX) ** 2 + (e.y - fromY) ** 2;
      if (n > bestN || (n === bestN && d < bestD)) { bestN = n; bestD = d; best = e; }
    }
    return best;
  }

  areaDamage(x, y, radius, dmg, { nonLethal = false, knock = 1, numbers = true } = {}) {
    const r2 = radius * radius;
    let hits = 0;
    for (const e of this.alive()) {
      if ((e.x - x) ** 2 + (e.y - y) ** 2 > r2) continue;
      const done = e.hit(dmg, nonLethal, knock, [x, y]);
      hits++;
      if (numbers && done >= 1) this.add(fx.damageNumber(e.x, e.y + e.size * 0.5, Math.round(done)));
    }
    return hits;
  }

  /**
   * 최근 DPS_WINDOW 초 동안의 실피해 / 그 시간. 창을 쓰는 이유: 순간값은 폭발 한 방에
   * 튀어 못 읽고, 판 전체 평균은 지금 세팅이 센지 약한지를 못 보여 준다.
   */
  stepDps(dt) {
    const d = this.dps;
    const now = this.time;
    d.win.push([now, dmgMeter.total - d.seen]);
    d.seen = dmgMeter.total;
    while (d.win.length && now - d.win[0][0] > DPS_WINDOW) d.win.shift();
    const span = Math.min(now - d.start, DPS_WINDOW);
    let sum = 0;
    for (const [, v] of d.win) sum += v;
    d.value = span > 0.25 ? sum / span : 0;
    d.peak = Math.max(d.peak, d.value);
    d.total += d.win.length ? d.win[d.win.length - 1][1] : 0;
  }

  add(effect) { this.effects.push(effect); return effect; }
  shake(amp = 6, dur = 0.12) { this.shakeAmp = amp; this.shakeT = dur; }

  // ── 진행 ────────────────────────────────────────────────────────────
  update(dt) {
    if (this.paused || !this.stats) return;
    this.time += dt;
    this.stepDps(dt);
    const a = this.agent, st = this.stats;

    this.movePlayer(dt);
    // 조준 = 가장 가까운 적(AutoShooter.AimAt). 요원은 상시 자동조준이다.
    const tgt = this.nearest(a.x, a.y, 14);
    if (tgt) a.aim = Math.atan2(-(tgt.y - a.y), tgt.x - a.x);
    this.fireCannon(dt);

    this.cam.x += (a.x - this.cam.x) * Math.min(1, dt * 6);
    this.cam.y += (a.y - this.cam.y) * Math.min(1, dt * 6);

    this.stepEnemies(dt);
    this.stepShots(dt);
    this.stepShells(dt);
    this.stepPickups(dt);
    this.stepEnemyBullets(dt);
    this.stepPlayer(dt);

    for (let i = this.effects.length - 1; i >= 0; i--) {
      const f = this.effects[i];
      f.update(dt, this);
      if (f.dead) this.effects.splice(i, 1);
    }
    if (this.shakeT > 0) this.shakeT -= dt;
  }

  movePlayer(dt) {
    const a = this.agent, st = this.stats;
    if (a.dead) { a.vx = a.vy = 0; a.walking = false; return; }
    if (this.control === 'auto') {
      // 8자 순찰 — 손 놓고 지켜볼 때. 폭을 화면 절반 넘게 잡아야 카메라가 흐르고,
      // 설치형 스킬(지뢰)이 실제로 밟히고, 적이 발밑에 굳지 않는다.
      const t = this.time * 0.34;
      const nx = Math.sin(t) * 3.1, ny = Math.sin(t * 2) * 4.6;
      a.vx = (nx - a.x) / Math.max(dt, 0.001);
      a.vy = (ny - a.y) / Math.max(dt, 0.001);
      a.x = nx; a.y = ny;
    } else {
      const ix = this.input.x, iy = this.input.y;
      const m = Math.hypot(ix, iy);
      if (m > 0.01) {
        const sp = st.moveSpeed;
        a.vx = (ix / m) * sp; a.vy = (iy / m) * sp;
        a.x += a.vx * dt; a.y += a.vy * dt;
      } else { a.vx = a.vy = 0; }
    }
    a.walking = Math.hypot(a.vx, a.vy) > 0.25;
    a.trail.unshift([a.x, a.y]);
    if (a.trail.length > 180) a.trail.pop();
    if (Math.hypot(a.vx, a.vy) > 0.05) {
      const m = Math.hypot(a.vx, a.vy);
      a.face = [a.vx / m, a.vy / m];
    }
  }

  /** 지금 장착 무기 제원(그림용). 편성이 없으면 기본 총으로 폴백한다. */
  get gun() { return (this.stats && this.stats.weapon) || GUN_FALLBACK; }

  /**
   * 주포. 게임 AutoShooter.FireVolley 를 그대로 옮겼다 —
   * 간격 = 요원 연사 × 자동사격 배율 × 주포 사다리, 탄 수 = 총열 볼리 + (동시 발사 - 1),
   * 발당 피해 = ShotDamage 에 크리·산포를 굴린 값. 사거리 안에 적이 있을 때만 쏜다.
   */
  fireCannon(dt) {
    const a = this.agent, st = this.stats;
    a.recoil = Math.max(0, a.recoil - dt * RECOIL_DECAY);
    if (a.flashT >= 0) { a.flashT += dt; if (a.flashT > 0.15) a.flashT = -1; }
    if (!this.cannonOn || a.dead) return;
    a.fireT -= dt;
    if (a.fireT > 0) return;
    const range = st.range * MC.RANGE_MUL;
    if (!this.nearest(a.x, a.y, range)) return;

    a.fireT = MC.interval(st, this.cannonLv, this.cannonEvo);
    a.recoil = 1;
    a.flashT = 0;
    const gun = this.gun;
    const n = MC.shots(st, this.cannonLv);
    const spread = gun.spreadDeg || 0;
    const base = MC.shotDamage(st, this.cannonLv, this.cannonEvo);
    const pierce = st.pierce + MC.pierceBonus(this.cannonLv, this.cannonEvo);
    const [mx, my] = this.muzzle();
    for (let i = 0; i < n; i++) {
      const splay = spread > 0.01 && n > 1 ? (i / (n - 1) - 0.5) * spread * Math.PI / 180 : 0;
      const ang = a.aim + splay;
      const [dmg, crit] = critF(st, base);
      this.shots.push({
        x: mx, y: my, vx: Math.cos(ang) * st.bulletSpeed, vy: -Math.sin(ang) * st.bulletSpeed,
        t: 0, dmg, crit, range, pierce, hits: new Set(),
        explodeRadius: gun.explodeRadius || 0, explodeMul: gun.explodeDamageMul || 0,
      });
    }
    // 탄피는 총 뒤쪽 위로 튄다(게임은 muzzleLen × 0.35 지점에서 배출한다). 런처·레이저는 탄피가 없다.
    if (gun.shellSprite) {
      const back = a.aim + Math.PI;
      this.shells.push({
        sprite: gun.shellSprite,
        x: a.x + Math.cos(a.aim) * (gun.muzzleLen || 1.94) * 0.35 * AGENT_SCALE,
        y: a.y + PIVOT_Y * AGENT_SCALE - Math.sin(a.aim) * (gun.muzzleLen || 1.94) * 0.35 * AGENT_SCALE,
        vx: Math.cos(back) * 1.1 + (Math.random() - 0.5) * 0.6,
        vy: 1.4 + Math.random() * 0.5,
        rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 16, t: 0,
      });
    }
  }

  stepEnemies(dt) {
    const a = this.agent;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead) { this.killEnemy(e); this.enemies.splice(i, 1); continue; }
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) { e.slowMul = 1; e.frozen = false; } }
      if (e.flash > 0) e.flash -= dt;
      const dx = a.x - e.x, dy = a.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      // 등속 접근(유저 2026-08-02: 분리 스티어링이 속도에 더해져 겹칠수록 빨라지던 것을 방향만 밀도록 변경).
      const sp = e.speed * e.slowMul;
      if (d > 0.4) { e.x += (dx / d) * sp * dt; e.y += (dy / d) * sp * dt; }
      e.x += e.kx * dt; e.y += e.ky * dt;
      e.kx *= 1 - Math.min(1, 6 * dt); e.ky *= 1 - Math.min(1, 6 * dt);
      e.facing = rotNoseDown(dx, dy);

      // 접촉 피해: ContactTick 주기의 지속 피해다(구 "부딪히면 한 방" 아님).
      if (e.contactDamage > 0 && d < e.radius + 0.3) {
        e.contactT -= dt;
        if (e.contactT <= 0) {
          e.contactT = CONTACT_TICK;
          this.hurtPlayer(e.contactDamage * CONTACT_DPS_MUL * CONTACT_TICK, true);
        }
      } else e.contactT = 0;

      if (e.ranged && !e.frozen) {
        e.fireT -= dt * e.slowMul;
        if (e.fireT <= 0 && d < 9) {
          e.fireT = e.fireInterval;
          this.bullets.push({ x: e.x, y: e.y, vx: (dx / d) * 3.4, vy: (dy / d) * 3.4, t: 0, dmg: e.contactDamage });
        }
      }
    }
  }

  /** 사망 처리 — 폭발·셀 드롭·집계. 규칙은 Enemy.Die 그대로다(코인은 킬에서 안 나온다). */
  killEnemy(e) {
    const st = this.stats, eco = B.D().economy;
    this.add(fx.explosion(e.x, e.y, e.boss ? 4 : e.strong ? 2 : 1));
    if (e.boss) this.shake(14, 0.4);
    else if (e.kind === 'Brute') this.shake(6, 0.18);
    const chance = eco.cellDropChance * st.cellDropMul;
    if (e.boss || Math.random() < chance) {
      const valMul = eco.cellDropValueMul * (e.boss ? 1 : this.rewardMul);
      const v = Math.max(1, Math.round(e.cell * st.xpMul * valMul));
      this.gems.push({ x: e.x, y: e.y, t: 0, pull: false, value: v });
    }
    this.onKill?.(e, Math.max(1, Math.round(e.score * this.rewardMul)));
  }

  stepShots(dt) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const b = this.shots[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.t += dt;
      const speed = Math.hypot(b.vx, b.vy);
      let gone = b.t * speed > b.range;
      if (!gone) {
        for (const e of this.alive()) {
          if (b.hits.has(e.id)) continue;
          if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 > (e.radius + 0.12) ** 2) continue;
          b.hits.add(e.id);
          const done = e.hit(b.dmg, false, 0.5, [b.x, b.y]);
          if (done >= 1) this.add(fx.damageNumber(e.x, e.y + e.size * 0.5, Math.round(done), b.crit ? '#ffd14d' : '#ffffff'));
          if (b.explodeRadius > 0) {
            this.areaDamage(b.x, b.y, b.explodeRadius, b.dmg * b.explodeMul, { knock: 0.8 });
            this.add(fx.explosion(b.x, b.y, b.explodeRadius));
            gone = true;
          } else if (b.hits.size > b.pierce) gone = true;
          break;
        }
      }
      if (gone) this.shots.splice(i, 1);
    }
  }

  stepShells(dt) {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const c = this.shells[i];
      c.t += dt;
      c.x += c.vx * dt; c.y += c.vy * dt;
      c.vy -= 5.5 * dt;                 // 탑다운이지만 살짝 튀었다 가라앉는 느낌만 준다
      c.rot += c.spin * dt;
      if (c.t > 0.7) this.shells.splice(i, 1);
    }
  }

  /** 셀. 자력 반경 안에 들면 빨려 들어온다(게임 MagnetRange 1.4 × magnetMul). */
  stepPickups(dt) {
    const a = this.agent, reach = 1.4 * this.stats.magnetMul;
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i];
      g.t += dt;
      const dx = a.x - g.x, dy = a.y - g.y;
      const d = Math.hypot(dx, dy) || 1;
      if (g.pull || d < reach) {
        g.pull = true;
        const sp = 5 + g.t * 4;
        g.x += (dx / d) * sp * dt; g.y += (dy / d) * sp * dt;
      }
      if (d < 0.3) { this.onPickCell?.(g.value); this.gems.splice(i, 1); }
      else if (g.t > 30) this.gems.splice(i, 1);
    }
  }

  stepEnemyBullets(dt) {
    const a = this.agent;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.t += dt;
      if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 < 0.3 * 0.3) {
        this.hurtPlayer(b.dmg, false);
        this.bullets.splice(i, 1);
        continue;
      }
      if (b.t > 6 || !this.onScreen(b.x, b.y, 2)) this.bullets.splice(i, 1);
    }
  }

  stepPlayer(dt) {
    const a = this.agent, st = this.stats;
    if (a.dead) return;
    if (a.iframeT > 0) a.iframeT -= dt;
    // 접촉 램프: 끊기지 않고 붙어 있을수록 아프다. 0.4초 떨어지면 즉시 리셋 = 빠져나오면 바로 보상.
    if (this.time - a.lastContactAt > CONTACT_BREAK) a.contactStreak = 0;
    if (st.regen > 0 && a.hp < a.maxHp) a.hp = Math.min(a.maxHp, a.hp + st.regen * dt);
  }

  /**
   * 플레이어 피해(PlayerHealth.TakeDamage). 순서가 곧 값이다:
   * 회피 → 정률 감산(defense) → flat 정감(armor) → 무적 프레임.
   * 지속 피해(continuous)는 armor 가 틱 비율만큼만 깎이고 최소 1 바닥도 없다.
   */
  hurtPlayer(dmg, continuous) {
    const a = this.agent, st = this.stats;
    if (a.dead || this.godMode) return 0;
    if (continuous) {
      const gap = this.time - a.lastContactAt;
      a.contactStreak = gap > CONTACT_BREAK ? 0 : a.contactStreak + Math.min(gap, CONTACT_TICK);
      a.lastContactAt = this.time;
      dmg *= rampMul(a.contactStreak);
    } else {
      if (a.iframeT > 0) return 0;
      a.iframeT = BASE_IFRAME + st.iframe;
    }
    if (st.dodge > 0 && Math.random() < st.dodge) return 0;
    // 보급 실드 스택(RunBuffs)은 정률·정감보다 먼저 소모된다 — 30초로 사라지는 자원이라 아껴 봐야 버려진다.
    if (this.shieldCharges > 0 && !continuous) { this.shieldCharges--; return 0; }
    dmg *= 1 - Math.min(1, Math.max(0, st.defense));
    if (st.armor > 0) {
      dmg = continuous ? Math.max(0, dmg - st.armor * CONTACT_TICK) : Math.max(1, dmg - st.armor);
    }
    a.hp -= dmg;
    this.dps.taken += dmg;
    if (a.hp <= 0) { a.hp = 0; a.dead = true; this.onPlayerDeath?.(); }
    return dmg;
  }

  /** 물량 파도(horde) 보상 감액 — run.js 가 웨이브 타입에 맞춰 갈아 준다. */
  rewardMul = 1;

  /** 총구 월드 좌표. 피벗에서 muzzleLen 만큼 조준 방향으로 나간 자리(게임과 같은 식). */
  muzzle() {
    const a = this.agent;
    const px = a.x - Math.cos(a.aim) * a.recoil * RECOIL_UNITS * AGENT_SCALE;
    const py = a.y + (PIVOT_Y + Math.sin(a.aim) * a.recoil * RECOIL_UNITS) * AGENT_SCALE;
    const len = (this.gun.muzzleLen || 1.94) * AGENT_SCALE;
    return [px + Math.cos(a.aim) * len, py - Math.sin(a.aim) * len];
  }

  // ── 그리기 ──────────────────────────────────────────────────────────
  draw() {
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    if (this.shakeT > 0) {
      const k = this.shakeAmp * (this.shakeT / 0.12);
      ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
    }
    ctx.imageSmoothingEnabled = false;

    this.drawFloor(ctx);
    if (this.showProps) this.drawProps(ctx);

    // 바닥 위 층(장판, 지뢰, 웅덩이) 다음에 유닛, 그 위에 탄과 연출.
    // 게임의 sortingOrder 순서를 그대로 흉내낸다.
    this.drawLayer(ctx, 'ground');
    if (this.groundHook) this.groundHook(ctx, this);   // 지속형 스킬(플라즈마 필드)이 여기 그린다
    this.drawGems(ctx);
    this.drawEnemies(ctx);
    this.drawBullets(ctx);
    this.drawShells(ctx);
    this.drawAgent(ctx);
    this.drawShots(ctx);
    if (this.topHook) this.topHook(ctx, this);   // 유닛 위에 도는 설치물(칼날, 드론, 보호막)
    this.drawLayer(ctx, null);
    this.drawLayer(ctx, 'top');

    this.drawVignette(ctx);
    ctx.restore();
  }

  drawLayer(ctx, layer) {
    for (const f of this.effects) if ((f.layer || null) === layer) f.draw(ctx, this);
  }

  drawFloor(ctx) {
    const im = fx.img(this.background);
    if (!fx.ready(im)) { ctx.fillStyle = '#0a1018'; ctx.fillRect(0, 0, W, H); return; }
    const tile = CHUNK * this.ppu;
    const ox = ((-this.cam.x * this.ppu + W / 2) % tile + tile) % tile;
    const oy = ((this.cam.y * this.ppu + H / 2) % tile + tile) % tile;
    for (let x = ox - tile; x < W + tile; x += tile)
      for (let y = oy - tile; y < H + tile; y += tile)
        ctx.drawImage(im, Math.round(x - tile / 2), Math.round(y - tile / 2), tile, tile);
  }

  /** 청크마다 고정으로 서는 소품. 사막만 해시 산포다(LabFloor 와 같은 규칙). */
  drawProps(ctx) {
    const half = CHUNK / 2;
    const c0x = Math.round(this.cam.x / CHUNK), c0y = Math.round(this.cam.y / CHUNK);
    for (let cy = c0y - 1; cy <= c0y + 1; cy++) {
      for (let cx = c0x - 1; cx <= c0x + 1; cx++) {
        const ox = cx * CHUNK, oy = cy * CHUNK;
        if (this.background === 'desert_chunk') {
          const n = 3 + Math.floor(hash01(cx, cy, 0) * 3);
          for (let k = 0; k < n; k++) {
            const d = pickDecor(hash01(cx, cy, k * 4 + 1));
            const px = ox + hash01(cx, cy, k * 4 + 2) * CHUNK - half;
            const py = oy + hash01(cx, cy, k * 4 + 3) * CHUNK - half;
            const w = d.w * (0.85 + hash01(cx, cy, k * 4 + 4) * 0.3);
            if (this.onScreen(px, py, 3)) fx.sprite(ctx, this, d.s, px, py, { w });
          }
          continue;
        }
        for (const p of PROPS[this.background] || []) {
          // LabFloor.TileToLocal — 타일 좌표계는 위가 0이라 y 를 뒤집는다.
          const px = ox + (p.x - 8), py = oy + (8 - p.y);
          if (!this.onScreen(px, py, 4)) continue;
          fx.sprite(ctx, this, p.s, px, py, { w: p.w, rot: p.v ? Math.PI / 2 : 0 });
        }
      }
    }
  }

  drawGems(ctx) {
    for (const g of this.gems) {
      // 크기는 티어와 무관하게 하나다(게임 2026-07-30에 값별 확대 폐기). 티어는 색으로만 가른다.
      // 색 셋 = XPGem.TierBlue/Green/Red 그대로 — 은백 원본에 곱해지는 값이라 파랑도 칠해야 한다.
      const tint = g.value >= 10 ? '#ff6b7a' : g.value >= 3 ? '#73ff99' : '#73bfff';
      const s = 2 * 0.13 * (1 + 0.07 * Math.sin(this.time * 6));
      fx.sprite(ctx, this, 'xp_gem', g.x, g.y, { w: s, tint, tintMul: true });
    }
  }

  drawShots(ctx) {
    for (const b of this.shots)
      // 굵기는 주포 사다리가 정한다(볼트 그림이 바뀌어도 화면 폭이 안 튀게 12px 로 정규화).
      fx.sprite(ctx, this, this.gun.bulletSprite || 'bullet_bolt', b.x, b.y, {
        w: (12 / 32) * this.stats.bulletScale * MC.thickMul(this.cannonLv, this.cannonEvo),
        rot: rotNoseUp(b.vx, b.vy), blend: 'lighter',
      });
  }

  drawShells(ctx) {
    for (const c of this.shells)
      fx.sprite(ctx, this, c.sprite, c.x, c.y, { w: (9 / 32) * 0.6, rot: c.rot, alpha: 1 - c.t / 0.7 });
  }

  drawEnemies(ctx) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      const frame = Math.floor(this.time * 8 + e.seed * 3) % 9;
      const bob = Math.sin(this.time * 2.2 + e.seed) * 0.035;
      // 보스만 이름 규칙이 다르다(boss_p{n}) — 잡몹처럼 접미사로 만들면 enemy_p1__0 이라는 없는 이름이 나온다.
      const name = e.boss
        ? `boss_p${this.planet + 1}_${frame}`
        : `enemy_p${this.planet + 1}_${e.suffix}_${frame}`;
      // 추진 화염이 먼저(몸체 바로 뒤). EnemyThrust 의 크기·간격 계수를 그대로 옮겼다.
      if (e.facing !== undefined && !e.frozen && !e.boss) {
        const dx = this.agent.x - e.x, dy = this.agent.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        const back = 0.417 * e.size;
        fx.sprite(ctx, this, 'enemy_thrust', e.x - (dx / d) * back, e.y + bob - (dy / d) * back, {
          w: 0.5617 * e.size, rot: rotNoseUp(dx, dy), alpha: 0.75 * (0.85 + 0.15 * Math.sin(this.time * 14 + e.seed)),
          blend: 'lighter',
        });
      }
      fx.sprite(ctx, this, name, e.x, e.y + bob, { w: e.size, rot: e.facing || 0 });
      if (e.frozen) fx.sprite(ctx, this, name, e.x, e.y + bob, { w: e.size, rot: e.facing || 0, tint: '#8fd8ff', alpha: 0.75, blend: 'lighter' });
      else if (e.slowMul < 0.95) fx.sprite(ctx, this, name, e.x, e.y + bob, { w: e.size, rot: e.facing || 0, tint: '#7fa8ff', alpha: 0.35, blend: 'lighter' });
      if (e.flash > 0) fx.sprite(ctx, this, name, e.x, e.y + bob, { w: e.size, rot: e.facing || 0, tint: '#ffffff', alpha: 0.9, blend: 'lighter' });
      if (e.hp < e.maxHp) this.drawHpBar(ctx, e);
    }
  }

  drawBullets(ctx) {
    for (const b of this.bullets)
      fx.sprite(ctx, this, 'bullet_bolt', b.x, b.y, { w: 12 / 32, rot: rotNoseUp(b.vx, b.vy), tint: '#ff7a6b', blend: 'lighter' });
  }

  /** 충격 펄스가 쓴다 — 반경 안 적 탄환을 지운다(게임은 풀로 반환한다). */
  clearBullets(x, y, radius) {
    const before = this.bullets.length;
    this.bullets = this.bullets.filter((b) => (b.x - x) ** 2 + (b.y - y) ** 2 > radius * radius);
    return before - this.bullets.length;
  }

  drawHpBar(ctx, e) {
    const [sx, sy] = this.toScreen(e.x, e.y + e.size * 0.62);
    const w = Math.max(34, e.size * this.ppu * 0.9), h = 6;
    ctx.save();
    ctx.fillStyle = 'rgba(4,8,14,.75)';
    ctx.fillRect(sx - w / 2, sy, w, h);
    ctx.fillStyle = e.strong ? '#ffb13d' : '#2de8ff';
    ctx.fillRect(sx - w / 2, sy, w * (e.hp / e.maxHp), h);
    ctx.restore();
  }

  drawAgent(ctx) {
    const a = this.agent;
    // 주포 사거리 — 스킬 범위와 같은 표시 규칙을 쓴다. 이게 없으면 스킬 없는 판에서
    // "범위 표시" 를 켜도 화면에 아무 일도 안 일어나 고장으로 보인다.
    if (this.showRanges && !a.dead) fx.rangeRing(ctx, this, a.x, a.y, this.stats.range * MC.RANGE_MUL, fx.AMBER, 0.7);
    if (a.dead) { this.drawDownedAgent(ctx, a); return; }
    const left = Math.abs(a.aim) > Math.PI / 2;
    const body = a.walking ? `warrior_walk_s_${Math.floor(this.time * 12) % 8}` : 'warrior_s';
    this.drawHeading(ctx, a);
    // 무적 프레임 동안 깜빡인다 — 맞았다는 사실이 화면에 남아야 다음 판단이 선다.
    const blink = a.iframeT > 0 && Math.floor(this.time * 20) % 2 === 0;
    this.drawWarrior(ctx, a.x, a.y, a.aim, body, left, blink ? 0.45 : 1, null, a);
    this.drawPlayerHp(ctx, a);
  }

  drawDownedAgent(ctx, a) {
    this.drawWarrior(ctx, a.x, a.y, a.aim, 'warrior_s', false, 0.35, '#ff6b6b', a);
  }

  /** 요원 발밑 HP 바(게임 PlayerHpBar). 상단 HUD 가 아니라 여기 있어야 눈이 안 떠난다. */
  drawPlayerHp(ctx, a) {
    if (a.hp >= a.maxHp) return;
    const [sx, sy] = this.toScreen(a.x, a.y - 0.62);
    const w = 96, h = 8, f = Math.max(0, a.hp / a.maxHp);
    ctx.save();
    ctx.fillStyle = 'rgba(4,8,14,.8)';
    ctx.fillRect(sx - w / 2, sy, w, h);
    ctx.fillStyle = f > 0.5 ? '#6bffa0' : f > 0.25 ? '#ffb13d' : '#ff6b6b';
    ctx.fillRect(sx - w / 2, sy, w * f, h);
    ctx.restore();
  }

  /** 진행 방향 화살표. 멈춰도 마지막 방향을 유지한다(게임과 같다 — 서 있어도 방향이 읽혀야 한다). */
  drawHeading(ctx, a) {
    const [fx0, fy0] = a.face;
    const hx = a.x + fx0 * HEADING_DIST, hy = a.y + fy0 * HEADING_DIST;
    const [sx, sy] = this.toScreen(hx, hy);
    const r = HEADING_SIZE * this.ppu;
    ctx.save();
    ctx.globalAlpha = a.walking ? 0.6 : 0.3;
    ctx.fillStyle = '#ffffff';
    ctx.translate(sx, sy);
    ctx.rotate(Math.atan2(fx0, fy0));
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.72, r * 0.6);
    ctx.lineTo(-r * 0.72, r * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /**
   * 요원과 복제가 공유하는 그리기. tint 를 주면 홀로그램 복제가 된다.
   * 총 기하는 WarriorVisual 그대로다: 피벗은 몸통 중심에서 PIVOT_Y, 총 그림은 피벗에서
   * GRIP_OFF_X 만큼 앞, 총구는 muzzleLen, 섬광은 muzzleLen + flashAnchor. 전부 요원 로컬 단위라
   * AGENT_SCALE 을 곱해 월드로 바꾼다. 여기를 눈대중으로 잡으면 총이 손에서 뜬다.
   */
  drawWarrior(ctx, x, y, aim, bodyName, flip, alpha, tint, agent) {
    const bodyW = (128 / 32) * AGENT_SCALE;      // 1.12유닛
    const recoil = agent ? agent.recoil : 0;
    const px = x - Math.cos(aim) * recoil * RECOIL_UNITS * AGENT_SCALE;
    const py = y + (PIVOT_Y + Math.sin(aim) * recoil * RECOIL_UNITS) * AGENT_SCALE;

    const im = fx.img(bodyName);
    if (fx.ready(im)) {
      const [sx, sy] = this.toScreen(x, y);
      const pw = bodyW * this.ppu, ph = pw * (im.naturalHeight / im.naturalWidth);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(sx, sy);
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(tint ? tintedOnce(im, tint) : im, -pw / 2, -ph / 2, pw, ph);
      ctx.restore();
    }

    const gun = fx.img(this.gun.gunSprite || GUN_FALLBACK.gunSprite);
    if (fx.ready(gun)) {
      const gw = (gun.naturalWidth / 32) * AGENT_SCALE;
      const pw = gw * this.ppu, ph = pw * (gun.naturalHeight / gun.naturalWidth);
      const [sx, sy] = this.toScreen(px, py);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(sx, sy);
      ctx.rotate(aim);
      if (Math.abs(aim) > Math.PI / 2) ctx.scale(1, -1);
      ctx.drawImage(tint ? tintedOnce(gun, tint) : gun,
        GRIP_OFF_X * AGENT_SCALE * this.ppu - pw / 2, -ph / 2, pw, ph);

      // 총구 섬광. 3프레임을 50밀리초씩 넘긴다(게임과 같은 재생 속도).
      if (agent && agent.flashT >= 0) {
        const f = Math.min(2, Math.floor(agent.flashT / 0.05));
        const fl = fx.img(`muzzle_${this.gun.muzzleKey || GUN_FALLBACK.muzzleKey}_${f}`);
        if (fx.ready(fl)) {
          const fw = (fl.naturalWidth / 32) * AGENT_SCALE * this.ppu;
          const fh = fw * (fl.naturalHeight / fl.naturalWidth);
          ctx.globalCompositeOperation = 'lighter';
          const g = this.gun;
          ctx.drawImage(fl, ((g.muzzleLen || 1.94) + (g.flashAnchor ?? 0.34)) * AGENT_SCALE * this.ppu - fw / 2, -fh / 2, fw, fh);
        }
      }
      ctx.restore();
    }
  }

  drawVignette(ctx) {
    const g = ctx.createRadialGradient(W / 2, H * 0.46, H * 0.28, W / 2, H * 0.46, H * 0.72);
    g.addColorStop(0, 'rgba(4,6,14,0)');
    g.addColorStop(1, 'rgba(4,6,14,.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}

const tintOnce = new Map();
function tintedOnce(im, color) {
  const key = im.src + color;
  let c = tintOnce.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(im, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  tintOnce.set(key, c);
  return c;
}
