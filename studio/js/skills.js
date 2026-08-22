// 스킬 16종의 발동 연출. 게임 컴포넌트 하나에 여기 정의 하나가 대응한다.
//
// 규칙 셋을 지킨다.
//   1. 주기·범위·개수는 formulas.js 에서만 읽는다. 여기에 숫자를 다시 적지 않는다.
//      레벨을 바꾸면 연출이 저절로 달라져야 하고, 그게 이 도구의 요점이다.
//   2. 표적을 고르는 규칙도 게임과 같다(가장 가까운 적 / 밀집 지점 / 화면 전체).
//      아무 데나 쏘면 그럴듯해 보여도 실제 화면과 다른 그림이 된다.
//   3. 액티브 스킬 16종의 폭발은 전부 사망 폭발 확대판(explosion 조각)이다 — 스킬 폭발에 컷 시퀀스를
//      쓰지 않는 게임 규칙 그대로. 드래프트 무기는 예외가 있다(강화 로켓 hrocket_boom 등, 게임도 그렇다).
import * as fx from './fx.js';
import { F, WF, WBAL } from './formulas.js';
import { rotNoseUp } from './stage.js';

const TAU = Math.PI * 2;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** 공용 투사체 조각. 적에 닿으면 피해를 주고 사라진다. */
function bolt(st, x, y, ax, ay, speed, dmg, o = {}) {
  const vx = Math.cos(ax) * speed, vy = Math.sin(ax) * speed;
  return st.add({
    t: 0, dead: false, x, y,
    update(dt) {
      this.t += dt;
      this.x += vx * dt; this.y += vy * dt;
      if (o.range && this.t * speed > o.range) { this.dead = true; if (o.onEnd) o.onEnd(this.x, this.y); return; }
      if (this.t > 4) { this.dead = true; return; }
      for (const e of st.alive()) {
        if (dist(this, e) > e.radius + 0.14) continue;
        const done = e.hit(dmg, false, o.knock == null ? 0.6 : o.knock, [this.x, this.y]);
        if (done >= 1) st.add(fx.damageNumber(e.x, e.y + e.size * 0.5, Math.round(done)));
        this.dead = true;
        if (o.onHit) o.onHit(this.x, this.y);
        return;
      }
    },
    draw(ctx, s) {
      fx.sprite(ctx, s, o.sprite || 'bullet_bolt', this.x, this.y,
        { w: (o.w || 12 / 32), rot: rotNoseUp(vx, vy), blend: o.blend === undefined ? 'lighter' : o.blend, tint: o.tint });
    },
  });
}

// ── 1. 라이트닝 체인 ──────────────────────────────────────────────────────
function castChain(st, o) {
  const a = st.agent;
  if (!st.alive().length) return false;
  const hops = F.chainHops(o.level, o.evo);
  const shots = F.chainShots(o.evo);
  const dmg = F.chainDamage(o.level, o.dmg);
  const shared = new Set();
  // 진화는 요원 자리에 뇌우 컷, 아니면 방전 임팩트 하나(게임 CastChain 과 같다).
  if (o.evo) st.add(fx.cut('cut_storm', a.x, a.y, 3.0));
  else st.add(fx.zap(a.x, a.y, 1.7));
  for (let s = 0; s < shots; s++) chainRun(st, [a.x, a.y], hops, dmg, shared);
  return true;
}

function chainRun(st, from, hops, dmg, seen) {
  // 홉당 0.05초를 두고 순차로 뻗는다. 사슬이 자라는 게 보여야 한다(게임 HopDelay).
  const links = [];
  let cur = from, left = hops, t = 0;
  st.add({
    t: 0, dead: false, layer: 'top',
    update(dt) {
      this.t += dt;
      while (left > 0 && this.t >= t) {
        const next = pickChainTarget(st, cur, seen);
        if (!next) { left = 0; break; }
        seen.add(next.id);
        const done = next.hit(dmg, false, 0.3, cur);
        if (done >= 1) st.add(fx.damageNumber(next.x, next.y + next.size * 0.5, Math.round(done), '#99d9ff'));
        links.push({ a: cur.slice ? cur : [cur[0], cur[1]], b: [next.x, next.y], age: 0, pts: null });
        st.add(fx.zap(next.x, next.y, 1.6));
        cur = [next.x, next.y];
        left--; t += F.chainHopDelay();
      }
      for (const l of links) l.age += dt;
      if (left <= 0 && links.every((l) => l.age > 0.22)) this.dead = true;
    },
    draw(ctx, s) {
      for (const l of links) {
        const decay = Math.max(0, 1 - l.age / 0.22);   // LightningArc.Life
        if (decay <= 0) continue;
        l.pts = fx.boltPath(l.a[0], l.a[1], l.b[0], l.b[1], decay);
        fx.drawBolt(ctx, s, l.pts, decay);
      }
    },
  });
}

function pickChainTarget(st, from, seen) {
  let best = null, bd = 6 * 6;   // 게임 ChainRoutine 과 같은 탐색 반경
  for (const e of st.alive()) {
    if (seen.has(e.id) || !st.onScreen(e.x, e.y)) continue;
    const d = (e.x - from[0]) ** 2 + (e.y - from[1]) ** 2;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// ── 2. 관통 로켓 ──────────────────────────────────────────────────────────
function castExplode(st, o) {
  const a = st.agent;
  const tgt = st.nearest(a.x, a.y, 13);
  const ang = tgt ? Math.atan2(tgt.y - a.y, tgt.x - a.x) : Math.PI / 2;
  const len = F.explodeLen(o.level);
  const dmg = F.explodeDamage(o.level, o.dmg);
  const speed = F.explodeSpeed();
  const life = F.explodeLife();
  const nextHit = new Map();
  st.add({
    t: 0, dead: false, x: a.x, y: a.y,
    update(dt) {
      this.t += dt;
      this.x += Math.cos(ang) * speed * dt;
      this.y += Math.sin(ang) * speed * dt;
      if (this.t >= life) { this.dead = true; return; }
      for (const e of st.alive()) {
        if (dist(this, e) > e.radius + len * 0.34) continue;
        const until = nextHit.get(e.id) || 0;
        if (this.t < until) continue;
        nextHit.set(e.id, this.t + 0.45);         // 같은 적 재타격 쿨 0.45초
        const done = e.hit(dmg, false, 0.5, [this.x, this.y]);
        if (done >= 1) st.add(fx.damageNumber(e.x, e.y + e.size * 0.5, Math.round(done)));
        if (o.evo) burstFragments(st, this.x, this.y, dmg * 0.4);
      }
    },
    draw(ctx, s) {
      // 분사 화염 → 본체. 게임은 MissileThrust 를 뒤에 붙인다.
      const bx = this.x - Math.cos(ang) * len * 0.5, by = this.y - Math.sin(ang) * len * 0.5;
      fx.disc(ctx, s, bx, by, len * 0.22 * (0.8 + Math.random() * 0.4), fx.CYAN, 0.5);
      fx.sprite(ctx, s, 'prrocket', this.x, this.y, { w: len, rot: rotNoseUp(Math.cos(ang), Math.sin(ang)) });
    },
  });
  return true;
}

function burstFragments(st, x, y, dmg) {
  for (let i = 0; i < 6; i++) bolt(st, x, y, (i / 6) * TAU, 0, 7, dmg, { range: 1.6, w: 10 / 32, tint: fx.CYAN });
}

// ── 3. 분열탄 ─────────────────────────────────────────────────────────────
function castSplit(st, o) {
  const a = st.agent;
  const n = F.splitFrags(o.level);
  const reach = F.splitRange(o.level);
  const dmg = F.splitDamage(o.level, o.dmg);
  const nova = o.evo;
  for (let i = 0; i < n; i++) {
    const ang = (TAU / n) * i;
    const endX = a.x + Math.cos(ang) * (reach - 0.3), endY = a.y + Math.sin(ang) * (reach - 0.3);
    bolt(st, a.x, a.y, ang, 0, 11, dmg, {
      range: reach, w: 12 / 32,
      onEnd: nova && (i & 1) === 0 ? () => plasmaPool(st, endX, endY, 0.7 + 0.02 * o.level, dmg * 0.26) : null,
    });
  }
  if (nova) st.add(fx.cut('cut_nova', a.x, a.y, 3.4));
  return true;
}

function plasmaPool(st, x, y, r, dps) {
  const life = F.poolLife();
  st.add({
    t: 0, tick: 0, dead: false, layer: 'ground',
    update(dt) {
      this.t += dt;
      this.tick -= dt;
      if (this.tick <= 0) { this.tick = 0.25; st.areaDamage(x, y, r, dps * 0.25, { knock: 0.1, numbers: false }); }
      if (this.t >= life) this.dead = true;
    },
    draw(ctx, s) {
      const fade = fx.clamp01((life - this.t) / 0.4);
      fx.plasmaDisc(ctx, s, x, y, r, 0.3 * fade, this.t * 1.2);
    },
  });
}

// ── 4. 플라즈마 필드 ──────────────────────────────────────────────────────
class FireField {
  constructor(st, o) { this.st = st; this.o = o; this.on = false; this.restT = 0.6; this.activeT = 0; this.tick = 0; this.pulse = 0; this.spin = 0; this.inferno = 0; }
  get total() { return F.fireRest(this.o.level, this.o.evo); }
  get left() { return this.on ? 0 : Math.max(0, this.restT); }
  update(dt) {
    const o = this.o, st = this.st;
    const dur = F.fireDuration(o.level, o.evo), rest = F.fireRest(o.level, o.evo);
    const r = F.fireRadius(o.level, o.evo), dps = F.fireDps(o.level, o.evo);
    if (!this.on) {
      this.restT -= dt;
      if (this.restT > 0) return;
      this.on = true; this.activeT = dur; this.tick = 0; this.pulse = 1;
    }
    this.activeT -= dt;
    if (this.activeT <= 0) { this.on = false; this.restT = rest; return; }
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = 0.25;
      st.areaDamage(st.agent.x, st.agent.y, r, dps * 0.25, { knock: 0.1, numbers: false });
      this.pulse = 1;
      if (o.evo) { this.inferno -= 0.25; if (this.inferno <= 0) { this.inferno = 1.8; st.add(fx.cut('cut_inferno', st.agent.x, st.agent.y, r * 2)); } }
    }
    this.pulse = Math.max(0, this.pulse - dt * 4.5);
    this.spin += 0.279 * dt;            // 게임과 같은 16도/초 자전
  }
  draw(ctx, st) {
    if (!this.on) return;
    const o = this.o;
    const dur = F.fireDuration(o.level, o.evo), r = F.fireRadius(o.level, o.evo);
    const fade = fx.clamp01(Math.min((dur - this.activeT) / 0.25, this.activeT / 0.25));
    fx.plasmaDisc(ctx, st, st.agent.x, st.agent.y, r, (0.26 + 0.125 * this.pulse) * fade, this.spin);
  }
}

// ── 5. 빙결 레이저 ────────────────────────────────────────────────────────
function castFrost(st, o) {
  const a = st.agent;
  const range = F.frostRange(o.level), width = F.frostWidth(o.level, o.evo);
  const freeze = F.frostFreeze(o.level, o.evo);
  const tgt = st.nearest(a.x, a.y, range);
  const ang = tgt ? Math.atan2(tgt.y - a.y, tgt.x - a.x) : Math.PI / 2;
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const hitList = [];
  for (const e of st.alive()) {
    const rx = e.x - a.x, ry = e.y - a.y;
    const proj = rx * dx + ry * dy;
    if (proj < 0 || proj > range) continue;
    const px = rx - dx * proj, py = ry - dy * proj;
    if (px * px + py * py > width * width) continue;
    e.slow(0, freeze);
    e.hit(Math.max(1, o.dmg * 0.118 * (1 + 0.45 * o.level) / 3), false, 0.2, [a.x, a.y]);
    st.add(fx.cut('cut_frost', e.x, e.y, 1.4, 20));
    hitList.push(e);
  }
  if (o.evo && hitList.length) {
    const caught = new Set(hitList.map((e) => e.id));
    const spread = F.frostSpread();
    for (const src of hitList) {
      for (const n of st.alive()) {
        if (caught.has(n.id) || dist(src, n) > spread) continue;
        caught.add(n.id);
        n.slow(0, freeze * 0.45);
        st.add(arc(src.x, src.y, n.x, n.y, 0.25));
        st.add(fx.cut('cut_absolute', n.x, n.y, 2.2));
      }
    }
  }
  st.add(beamFx(a.x, a.y, a.x + dx * range, a.y + dy * range));
  return true;
}

/**
 * 냉기 빔. 게임 FrostLaserSkill 은 LightningArc 한 줄만 쏜다(굵기 0.18, 수명 0.22).
 * 예전에는 여기에 발광 빔을 한 겹 더 얹었는데 게임에 없는 그림이었다.
 */
function beamFx(ax, ay, bx, by) {
  return {
    t: 0, dead: false, layer: 'top',
    update(dt) { this.t += dt; if (this.t > 0.22) this.dead = true; },
    draw(ctx, s) {
      const decay = 1 - this.t / 0.22;
      fx.drawBolt(ctx, s, fx.boltPath(ax, ay, bx, by, decay), decay, fx.ICE);
    },
  };
}

function arc(ax, ay, bx, by, life = 0.25) {
  return {
    t: 0, dead: false, layer: 'top',
    update(dt) { this.t += dt; if (this.t > life) this.dead = true; },
    draw(ctx, s) {
      const decay = 1 - this.t / life;
      fx.drawBolt(ctx, s, fx.boltPath(ax, ay, bx, by, decay), decay, fx.ICE);
    },
  };
}

// ── 6. 궤도 위성포 ────────────────────────────────────────────────────────
function castOrbital(st, o) {
  const tgt = st.densest(st.agent.x, st.agent.y);
  if (!tgt) return false;
  const px = tgt.x, py = tgt.y;
  const zone = F.orbitalWidth(o.level);
  const tele = F.orbitalTelegraph(), beamDur = F.orbitalBeamDur();
  const topY = st.cam.y + 9 + 0.8;
  let wiped = false;
  st.add({
    t: 0, dead: false, layer: 'top',
    update(dt) {
      this.t += dt;
      if (!wiped && this.t >= tele) {
        wiped = true;
        // 기둥 안은 체력·종류 무관 전멸. 보스와 균열만 면역이라 이 도구의 더미에는 전부 걸린다.
        for (const e of st.alive())
          if (Math.abs(e.x - px) <= zone && e.y > py - 0.6 && e.y < topY) e.hit(99999, false, 0, [px, py]);
        st.add(fx.explosion(px, py, 2.1));
        st.shake(10, 0.16);
      }
      if (this.t >= tele + beamDur + 0.18) this.dead = true;
    },
    draw(ctx, s) {
      const t = this.t;
      if (t < tele) {
        const p = t / tele;
        const r = fx.lerp(zone * 2.4, zone, p);
        fx.ring(ctx, s, px, py, r, fx.CYAN, 0.6 + 0.4 * p, 4, 'lighter');
        for (let i = 0; i < 4; i++) {
          const ang = t * 2.6 + i * Math.PI * 0.5;
          const tx = px + Math.cos(ang) * r, ty = py + Math.sin(ang) * r;
          const [sx, sy] = s.toScreen(tx, ty);
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          ctx.translate(sx, sy); ctx.rotate(-ang);
          ctx.fillStyle = '#9ef2ff'; ctx.globalAlpha = 0.9;
          ctx.fillRect(-0.11 * s.ppu, -0.035 * s.ppu, 0.22 * s.ppu, 0.07 * s.ppu);
          ctx.restore();
        }
        if (Math.floor(t * 12) % 2 === 0) {
          const [bx, by] = s.toScreen(px, py);
          ctx.save(); ctx.globalAlpha = 0.45; ctx.fillStyle = fx.CYAN;
          ctx.fillRect(bx - zone * s.ppu / 2, by - zone * s.ppu / 2, zone * s.ppu, zone * s.ppu);
          ctx.restore();
        }
        fx.sprite(ctx, s, 'sat_orbital', px, topY - 0.6 + Math.sin(t * 3) * 0.1, { w: 2 });
        return;
      }
      const bt = t - tele;
      const h = topY - py;
      const env = bt < 0.12 ? fx.lerp(2.2, 1, bt / 0.12) : 1 + Math.sin(bt * 34) * 0.07;
      const collapse = bt > beamDur ? Math.max(0, 1 - (bt - beamDur) / 0.18) : 1;
      const flip = Math.floor(bt / 0.06) % 2 === 0;
      const wMul = [2.1, 1.25, 0.7], alpha = [0.3, 0.65, 1];
      for (let i = 0; i < 3; i++) {
        const name = (flip === (i !== 2)) ? 'orbital_beam_0' : 'orbital_beam_1';
        const w = zone * wMul[i] * env * collapse;
        drawColumn(ctx, s, name, px, py + h / 2, w, h, alpha[i]);
      }
      fx.sprite(ctx, s, 'sat_orbital', px, topY - 0.6, { w: 2 });
    },
  });
  return true;
}

function drawColumn(ctx, st, name, wx, wy, w, h, alpha) {
  const im = fx.img(name);
  if (!fx.ready(im) || w <= 0) return;
  const [sx, sy] = st.toScreen(wx, wy);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(im, sx - (w * st.ppu) / 2, sy - (h * st.ppu) / 2, w * st.ppu, h * st.ppu);
  ctx.restore();
}

// ── 7·8. 지뢰 두 종 ───────────────────────────────────────────────────────
function mineEntity(st, x, y, o, breaker) {
  const born = st.time;
  const radius = breaker ? F.breakRadius(o.level) : F.mineRadius(o.level);
  const dmg = breaker ? F.breakDamage(o.level, o.dmg) : F.mineDamage(o.level, o.dmg);
  const sense = breaker ? F.breakSense() : F.mineSense();
  let fuse = -1;
  const e = st.add({
    t: 0, dead: false, layer: 'ground', mine: true, breaker,
    update(dt) {
      this.t += dt;
      if (this.t < 0.5) return;                       // 무장 지연
      if (!breaker) {
        if (st.nearest(x, y, sense)) this.blow();
        return;
      }
      const strong = st.alive().some((en) => en.strong && Math.hypot(en.x - x, en.y - y) <= radius);
      if (strong) return this.blow();
      if (fuse >= 0) { fuse -= dt; if (fuse <= 0) this.blow(); return; }
      if (st.nearest(x, y, sense)) fuse = F.breakFuse();
    },
    blow() {
      st.areaDamage(x, y, radius, dmg, { knock: breaker ? 0.6 : 0.4 });
      st.add(fx.explosion(x, y, breaker ? 1.6 : 2.6));
      if (breaker) st.shake(8, 0.12);
      this.dead = true;
    },
    draw(ctx, s) {
      const rate = fuse >= 0 ? 12 : 4;
      const even = (Math.floor(this.t * rate) & 1) === 0;
      const name = breaker ? (fuse >= 0 ? (even ? 'skillminebreak_2' : 'skillminebreak_1') : (even ? 'skillminebreak_0' : 'skillminebreak_1'))
        : (even ? 'skillmine_0' : 'skillmine_1');
      // 40px = 1.25유닛 원본에 게임 스케일(광역 0.62 · 장갑 0.46).
      fx.sprite(ctx, s, name, x, y, { w: 1.25 * (breaker ? 0.46 : 0.62) });
      if (s.showRanges) fx.rangeRing(ctx, s, x, y, radius, breaker ? fx.AMBER : fx.CYAN);
    },
  });
  return e;
}

const liveMines = (st, breaker) => st.effects.filter((e) => e.mine && e.breaker === breaker && !e.dead).length;

function castMine(st, o) {
  if (liveMines(st, false) >= F.mineMax(o.level)) return true;   // 만석이면 주기만 소모
  const a = st.agent;
  const ang = Math.random() * TAU;
  const r = (0.4 + Math.random() * 0.6) * F.mineThrow(o.level);
  mineEntity(st, a.x + Math.cos(ang) * r, a.y + Math.sin(ang) * r, o, false);
  return true;
}

function castMineBreak(st, o) {
  if (liveMines(st, true) >= F.breakMax()) return true;
  mineEntity(st, st.agent.x, st.agent.y, o, true);
  return true;
}

// ── 9. 중력장 우물 ────────────────────────────────────────────────────────
function castGravity(st, o) {
  const tgt = st.densest(st.agent.x, st.agent.y);
  if (!tgt) return false;
  const x = tgt.x, y = tgt.y;
  const dur = F.gravityDuration(o.level), r = F.gravityRadius(o.level);
  st.add({
    t: 0, tick: 0, dead: false, layer: 'ground',
    update(dt) {
      this.t += dt; this.tick -= dt;
      for (const e of st.alive()) {
        const tx = x - e.x, ty = y - e.y;
        const d = Math.hypot(tx, ty);
        if (d > r || d < 0.05) continue;
        const dirx = tx / d, diry = ty / d;
        const pull = 2.6 * (1 - d / (r * 1.15));
        e.x += (dirx * pull + -diry * 0.9) * dt;
        e.y += (diry * pull + dirx * 0.9) * dt;
      }
      if (this.tick <= 0) { this.tick = 0.3; st.areaDamage(x, y, r, F.gravityDps(o.level, o.dmg) * 0.3, { nonLethal: true, knock: 0.03, numbers: false }); }
      if (this.t >= dur) {
        st.areaDamage(x, y, r * 0.75, F.gravityBurst(o.level, o.dmg), { nonLethal: true });
        st.add(fx.explosion(x, y, 2.0));
        this.dead = true;
      }
    },
    draw(ctx, s) {
      const a = fx.clamp01(Math.min(this.t / 0.25, (dur - this.t) / 0.25 + 1)) * 0.9;
      fx.sprite(ctx, s, 'gravity_well', x, y, { w: 2 * r, rot: this.t * 4.19, alpha: a, blend: 'lighter' });
    },
  });
  return true;
}

// ── 10. 충격 펄스 ─────────────────────────────────────────────────────────
function castPulse(st, o) {
  const a = st.agent;
  const r = F.pulseRadius(o.level);
  st.areaDamage(a.x, a.y, r, F.pulseDamage(o.level, o.dmg), { nonLethal: true, knock: 4.2 });
  const cleared = st.clearBullets(a.x, a.y, r);
  st.add(fx.pulseRing(a.x, a.y, r));
  if (cleared) st.add(fx.damageNumber(a.x, a.y + 1.2, '탄 ' + cleared + ' 소거', fx.MINT));
  st.shake(5, 0.1);
  return true;
}

// ── 11. 시간 지연 펄스 ────────────────────────────────────────────────────
function castTimeslow(st, o) {
  const on = st.alive().filter((e) => st.onScreen(e.x, e.y));
  if (!on.length) return false;
  const mul = F.timeslowFactor(o.level), dur = F.timeslowDuration(o.level);
  on.forEach((e) => e.slow(mul, dur));
  const a = st.agent;
  st.add({
    t: 0, dead: false, layer: 'top',
    update(dt) { this.t += dt; if (this.t >= 0.55) this.dead = true; },
    draw(ctx, s) {
      const p = fx.clamp01(this.t / 0.55);
      fx.sprite(ctx, s, 'time_field', a.x, a.y, { w: 5 * (1 + p * 4.2), alpha: 0.85 * (1 - p), blend: 'lighter' });
    },
  });
  return true;
}

// ── 12. 야전 수복 장치 ────────────────────────────────────────────────────
// 전투 중 발동이 없는 스킬이라 무대에서는 웨이브 종료를 흉내 낸 주기로 돌린다.
function castRepair(st, o) {
  const a = st.agent;
  const pct = F.repairPercent(o.level);
  const shards = Array.from({ length: 14 }, (_, i) => ({ ang: (i / 14) * TAU + Math.random() * 0.3, d: 2.2 + Math.random() * 1.4 }));
  st.add({
    t: 0, dead: false, layer: 'top',
    update(dt) { this.t += dt; if (this.t >= 1.45) this.dead = true; },
    draw(ctx, s) {
      const t = this.t;
      const cx = a.x, cy = a.y;
      // ① 정비 패드 전개
      const pad = fx.clamp01(t / 0.30);
      fx.ring(ctx, s, cx, cy, 1.15 * pad, fx.CYAN, 0.7 * (1 - Math.max(0, (t - 1.1) / 0.35)), 4, 'lighter');
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * TAU + t * 0.8;
        fx.disc(ctx, s, cx + Math.cos(ang) * 1.15 * pad, cy + Math.sin(ang) * 1.15 * pad, 0.05, fx.MINT, 0.8 * pad);
      }
      // ② 나노 파편 수렴
      if (t < 0.85) {
        const p = fx.clamp01(t / 0.85);
        for (const sh of shards) {
          const d = sh.d * (1 - p);
          fx.disc(ctx, s, cx + Math.cos(sh.ang) * d, cy + Math.sin(sh.ang) * d, 0.07, fx.MINT, 0.9);
        }
      }
      // ③ 수복 파동
      if (t > 0.82 && t < 1.2) {
        const p = (t - 0.82) / 0.38;
        fx.ring(ctx, s, cx, cy, 0.4 + p * 1.9, fx.MINT, 1 - p, 6, 'lighter');
      }
      // ④ 회복량
      if (t > 0.85) {
        const [sx, sy] = s.toScreen(cx, cy + 1.3 + (t - 0.85) * 0.4);
        ctx.save();
        ctx.globalAlpha = fx.clamp01((1.45 - t) / 0.4);
        ctx.font = '700 40px Pretendard, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(3,7,14,.9)';
        const label = '체력 +' + Math.round(pct * 100) + '%';
        ctx.strokeText(label, sx, sy); ctx.fillStyle = fx.MINT; ctx.fillText(label, sx, sy);
        ctx.restore();
      }
    },
  });
  return true;
}

// ── 13. 리플랙션볼 ────────────────────────────────────────────────────────
const liveBalls = (st) => st.effects.filter((e) => e.ball && !e.dead).length;

function castReflectBall(st, o) {
  if (liveBalls(st) >= F.reflectBallMax(o.level)) return true;
  const a = st.agent;
  const tgt = st.nearest(a.x, a.y, 12);
  let ang = tgt ? Math.atan2(tgt.y - a.y, tgt.x - a.x) : Math.random() * TAU;
  const speed = F.reflectBallSpeed(), life = F.reflectBallLife(o.level);
  const dmg = F.reflectBallDamage(o.level, o.dmg);
  const R = 0.30;
  let vx = Math.cos(ang) * speed, vy = Math.sin(ang) * speed;
  const nextHit = new Map();
  st.add({
    t: 0, dead: false, ball: true, x: a.x, y: a.y, layer: 'top',
    update(dt) {
      this.t += dt;
      this.x += vx * dt; this.y += vy * dt;
      // 반사면은 보이는 화면 가장자리. 자기장 경계로 잡으면 화면 밖이라 계속 벗어난다.
      const limX = 10.125 / 2 - R, limY = 9 - R;
      let bounced = false;
      if (this.x < st.cam.x - limX && vx < 0) { vx = -vx; this.x = st.cam.x - limX; bounced = true; }
      else if (this.x > st.cam.x + limX && vx > 0) { vx = -vx; this.x = st.cam.x + limX; bounced = true; }
      if (this.y < st.cam.y - limY && vy < 0) { vy = -vy; this.y = st.cam.y - limY; bounced = true; }
      else if (this.y > st.cam.y + limY && vy > 0) { vy = -vy; this.y = st.cam.y + limY; bounced = true; }
      if (bounced) { st.add(fx.spark(this.x, this.y)); st.shake(6, 0.08); }
      for (const e of st.alive()) {
        if (dist(this, e) > R + 0.35 + e.radius * 0.4) continue;
        if (this.t < (nextHit.get(e.id) || 0)) continue;
        nextHit.set(e.id, this.t + F.reflectBallTick());
        const done = e.hit(dmg, false, 0.25, [this.x, this.y]);
        if (done >= 1) st.add(fx.damageNumber(e.x, e.y + e.size * 0.5, Math.round(done)));
      }
      if (this.t >= life) this.dead = true;
    },
    draw(ctx, s) {
      const fade = this.t > life - 0.4 ? fx.clamp01((life - this.t) / 0.4) : 1;
      const rot = this.t * 9.42;
      // 게임은 외곽 글로우(x2.1, 알파 0.30) 한 겹과 본체뿐이다. 잔상은 없다.
      fx.sprite(ctx, s, 'skill_reflectball', this.x, this.y, { w: R * 2 * 2.1, rot, alpha: 0.30 * fade, blend: 'lighter' });
      fx.sprite(ctx, s, 'skill_reflectball', this.x, this.y, { w: R * 2, rot, alpha: fade });
    },
  });
  return true;
}

// ── 14. 이온 수류탄 ───────────────────────────────────────────────────────
function castIon(st, o) {
  const tgt = st.densest(st.agent.x, st.agent.y);
  if (!tgt) return false;
  const from = [st.agent.x, st.agent.y], to = [tgt.x, tgt.y];
  const flight = F.ionFlight();
  st.add({
    t: 0, dead: false, layer: 'top',
    update(dt) {
      this.t += dt;
      if (this.t >= flight) {
        st.add(fx.explosion(to[0], to[1], 0.8));
        ionPool(st, to[0], to[1], o);
        this.dead = true;
      }
    },
    draw(ctx, s) {
      const p = fx.clamp01(this.t / flight);
      const x = fx.lerp(from[0], to[0], p), y = fx.lerp(from[1], to[1], p);
      // 탑다운이라 높이 대신 스케일이 부푼다(게임과 같은 눈속임).
      const arcScale = 1 + Math.sin(p * Math.PI) * 0.45;
      // 48px = 1.5유닛 원본에 게임 스케일 0.34. 전에 128px 로 잘못 보고 2.7배 크게 날렸다.
      fx.sprite(ctx, s, 'skill_iongrenade', x, y, { w: 1.5 * 0.34 * arcScale, rot: p * 5.24 });
    },
  });
  return true;
}

function ionPool(st, x, y, o) {
  const life = F.ionLife(o.level), r = F.ionRadius(o.level);
  const dps = F.ionDps(o.level, o.dmg), slow = F.ionSlow(o.level);
  st.add({
    t: 0, tick: 0, dead: false, layer: 'ground',
    update(dt) {
      this.t += dt; this.tick -= dt;
      const env = this.t < 0.12 ? fx.lerp(2.2, 1, this.t / 0.12) : 1;
      if (this.tick <= 0) {
        this.tick = 0.25;
        for (const e of st.alive()) {
          if (dist({ x, y }, e) > r * env) continue;
          e.hit(dps * 0.25, false, 0.1, [x, y]);
          e.slow(slow, 0.4);
        }
      }
      if (this.t >= life) this.dead = true;
    },
    draw(ctx, s) {
      const env = this.t < 0.12 ? fx.lerp(2.2, 1, this.t / 0.12) : 1;
      const fade = this.t > life - 0.55 ? fx.clamp01((life - this.t) / 0.55) : 1;
      const flick = 0.78 + (Math.floor(this.t / 0.06) % 2) * 0.18;
      fx.sprite(ctx, s, 'ion_pool', x, y, { w: 2 * r * env, alpha: 0.92 * flick * fade, blend: 'lighter' });
      if (s.showRanges) fx.rangeRing(ctx, s, x, y, r * env, fx.CYAN, fade);
    },
  });
}

// ── 15. 복제 안드로이드 ───────────────────────────────────────────────────
const liveClones = (st) => st.effects.filter((e) => e.clone && !e.dead).length;

function castClone(st, o) {
  const max = F.cloneMax(o.level);
  if (liveClones(st) >= max) return true;
  const order = liveClones(st) + 1;
  const dur = F.cloneDuration(o.level), ratio = F.cloneRatio(o.level);
  const delay = F.cloneFollowDelay() * order;
  let fireT = 0, px = st.agent.x, py = st.agent.y, walking = false;
  st.add({
    t: 0, dead: false, clone: true,
    update(dt) {
      this.t += dt;
      // 요원 궤적의 delay 초 전 지점을 그대로 따라 걷는다.
      const idx = Math.min(st.agent.trail.length - 1, Math.round(delay * 60));
      const p = st.agent.trail[idx] || [st.agent.x, st.agent.y];
      walking = Math.hypot(p[0] - px, p[1] - py) > 0.004;
      px = p[0]; py = p[1];
      fireT -= dt;
      const tgt = st.nearest(px, py, 8);
      if (tgt && fireT <= 0) {
        fireT = 0.22;
        bolt(st, px, py, Math.atan2(tgt.y - py, tgt.x - px), 0, 18, Math.max(1, o.dmg * 0.118 * ratio), { tint: fx.CYAN });
      }
      if (this.t >= dur) this.dead = true;
    },
    draw(ctx, s) {
      const a = st.agent;
      const aim = Math.atan2(-(a.y - py), a.x - px);
      const tgt = st.nearest(px, py, 8);
      const look = tgt ? Math.atan2(-(tgt.y - py), tgt.x - px) : aim;
      const fade = this.t > dur - 0.5 ? fx.clamp01((dur - this.t) / 0.5) : Math.min(1, this.t / 0.25);
      // 발밑 소환 링(게임도 time_field 조각을 눌러 재사용한다).
      const [rx, ry] = s.toScreen(px, py - 0.42);
      ctx.save();
      ctx.globalAlpha = 0.7 * fade; ctx.globalCompositeOperation = 'lighter';
      ctx.translate(rx, ry); ctx.scale(1, 0.42);
      const im = fx.img('time_field');
      if (fx.ready(im)) ctx.drawImage(im, -0.75 * s.ppu, -0.75 * s.ppu, 1.5 * s.ppu, 1.5 * s.ppu);
      ctx.restore();
      const body = walking ? `warrior_walk_s_${Math.floor(s.time * 12) % 8}` : 'warrior_s';
      s.drawWarrior(ctx, px, py, look, body, Math.abs(look) > Math.PI / 2, 0.55 * fade, '#73f2ff');
    },
  });
  return true;
}

// ── 16. 자동 조준 포탑 ────────────────────────────────────────────────────
const liveSentries = (st) => st.effects.filter((e) => e.sentry && !e.dead).length;

function castSentry(st, o) {
  if (liveSentries(st) >= F.sentryMax(o.level)) return true;
  const a = st.agent;
  const ang = Math.random() * TAU, d = 1.2 + Math.random() * 1.2;
  const gx = a.x + Math.cos(ang) * d, gy = a.y + Math.sin(ang) * d;
  const life = F.sentryLife(o.level), fireIv = F.sentryFireInterval(o.level);
  const dmg = F.sentryDamage(o.level, o.dmg), range = F.sentryRange(o.level);
  const DROP = 0.30;
  let landed = false, fireT = 0, aim = -Math.PI / 2;
  st.add({
    t: 0, dead: false, sentry: true,
    update(dt) {
      this.t += dt;
      if (this.t < DROP) return;
      if (!landed) {
        landed = true;
        st.add(sentryRing(gx, gy));
        st.shake(7, 0.12);
        st.areaDamage(gx, gy, 1.8, dmg * 5, { knock: 1.2 });
      }
      const tgt = st.nearest(gx, gy, range);
      if (tgt) {
        aim = Math.atan2(tgt.y - gy, tgt.x - gx);
        fireT -= dt;
        if (fireT <= 0) { fireT = fireIv; bolt(st, gx, gy, aim, 0, 20, dmg, { tint: fx.CYAN }); }
      }
      if (this.t >= DROP + life) {
        // 수명이 다하면 축소가 아니라 과부하 폭발. 장갑 파편이 흩어진다.
        st.add(fx.explosion(gx, gy, 1.6));
        for (let i = 0; i < 4; i++) st.add(sentryFrag(gx, gy, (i / 4) * TAU + Math.random()));
        st.shake(9, 0.14);
        this.dead = true;
      }
    },
    draw(ctx, s) {
      let x = gx, y = gy;
      if (this.t < DROP) { const p = this.t / DROP; y = gy + 4 * (1 - p * p); }
      const left = (DROP + life) - this.t;
      const hot = left < 1.2 && left > 0 ? (Math.floor(this.t * 14) % 2 === 0 ? 0.75 : 0.2) : 0;
      fx.sprite(ctx, s, 'skill_sentry', x, y, { w: 1.3, rot: rotNoseUp(Math.cos(aim), Math.sin(aim)) + Math.PI });
      if (hot) fx.sprite(ctx, s, 'skill_sentry', x, y, { w: 1.3, rot: rotNoseUp(Math.cos(aim), Math.sin(aim)) + Math.PI, tint: '#ffffff', alpha: hot, blend: 'lighter' });
      if (s.showRanges && landed) fx.rangeRing(ctx, s, gx, gy, range);
    },
  });
  return true;
}

function sentryRing(x, y) {
  return {
    t: 0, dead: false, layer: 'ground',
    update(dt) { this.t += dt; if (this.t >= 0.5) this.dead = true; },
    draw(ctx, s) {
      const k = fx.clamp01(this.t / 0.5);
      const w = 5 * (0.4 + k * 1.4) / 5 * 2.4;
      const [sx, sy] = s.toScreen(x, y);
      ctx.save();
      ctx.globalAlpha = 0.9 * (1 - k); ctx.globalCompositeOperation = 'lighter';
      ctx.translate(sx, sy); ctx.scale(1, 0.46);
      const im = fx.img('pulse_ring');
      if (fx.ready(im)) ctx.drawImage(im, -w * s.ppu / 2, -w * s.ppu / 2, w * s.ppu, w * s.ppu);
      ctx.restore();
    },
  };
}

function sentryFrag(x, y, ang) {
  let vx = Math.cos(ang) * 3.2, vy = Math.sin(ang) * 3.2;
  let px = x, py = y, rot = 0;
  const spin = fx.rnd(-9, 9);
  return {
    t: 0, dead: false, layer: 'top',
    update(dt) {
      this.t += dt;
      px += vx * dt; py += vy * dt;
      vx *= 1 - 3 * dt; vy *= 1 - 3 * dt;
      rot += spin * dt;
      if (this.t >= 0.55) this.dead = true;
    },
    draw(ctx, s) {
      const [sx, sy] = s.toScreen(px, py);
      ctx.save();
      ctx.globalAlpha = 1 - this.t / 0.55;
      ctx.translate(sx, sy); ctx.rotate(rot);
      ctx.fillStyle = '#8fd0e8';
      ctx.fillRect(-0.09 * s.ppu, -0.06 * s.ppu, 0.18 * s.ppu, 0.12 * s.ppu);
      ctx.restore();
    },
  };
}


// ══ 드래프트 무기 7종 ═════════════════════════════════════════════════════
// 액티브 스킬과 같은 무기 칸을 먹지만 WeaponBase 파생이라 만렙이 8이다.
// 아래 연출 수치는 전부 게임 스크립트 실측이다(스프라이트 자연 크기 = PNG 폭 ÷ 32).

/** 요원 주위 반경 r 안의 균일 랜덤 지점. 게임의 Random.insideUnitCircle * r. */
function spotNear(a, r) {
  const ang = Math.random() * TAU, d = Math.sqrt(Math.random()) * r;
  return [a.x + Math.cos(ang) * d, a.y + Math.sin(ang) * d];
}

// ── 강화 로켓 ─────────────────────────────────────────────────────────────
function castBomb(st, o) {
  const n = WF.bombCount(o.evo);
  const radius = WF.bombRadius(o.level, o.evo);
  const dmg = WF.bombDamage(o.level, o.evo, o.dmg);
  const a = st.agent;
  // BombWeapon.Update: 첫 발만 최근접 적(10유닛)을 노리고, 나머지는 요원 주위 5유닛 랜덤 지점이다.
  // 표적이 없어도 쏜다 — 그래서 이 스킬은 발동 실패가 없다.
  for (let i = 0; i < n; i++) {
    const tgt = i === 0 ? st.nearest(a.x, a.y, 10) : null;
    heavyRocket(st, a.x, a.y, tgt ? [tgt.x, tgt.y] : spotNear(a, 5), radius, dmg, o.evo);
  }
  return true;
}

/** HeavyRocket 그대로: 등속 11로 표적까지 날아가 0.35 안에 들면 폭발(수명 3.5초 안전장치). */
function heavyRocket(st, sx, sy, to, radius, dmg, evo) {
  let x = sx, y = sy, ang = Math.atan2(to[1] - sy, to[0] - sx);
  st.add({
    t: 0, dead: false, layer: 'top',
    update(dt) {
      this.t += dt;
      const dx = to[0] - x, dy = to[1] - y, d = Math.hypot(dx, dy);
      if (d < 0.35 || this.t >= 3.5) {
        st.areaDamage(x, y, radius, dmg, { knock: 1.2 });
        // Detonate: 전용 시퀀스 크기 = max(1.4, 반경×2). 융단(진화)만 cut_carpet 으로 교체된다.
        const size = Math.max(1.4, radius * 2);
        st.add(evo ? fx.cut('cut_carpet', x, y, size)
                   : fx.cut('hrocket_boom', x, y, size, 24, { frames: 9 }));
        st.shake(9, 0.2);
        this.dead = true;
        return;
      }
      ang = Math.atan2(dy, dx);
      x += (dx / d) * 11 * dt;
      y += (dy / d) * 11 * dt;
    },
    draw(ctx, s) {
      // hrocket 128px = 자연 4유닛, 게임 visLen 1.15. 탑다운 직선 비행이라 부풀지 않는다.
      fx.sprite(ctx, s, 'hrocket', x, y, { w: 1.15, rot: rotNoseUp(Math.cos(ang), Math.sin(ang)) });
    },
  });
}

// ── 유도 미사일 ───────────────────────────────────────────────────────────
function castHoming(st, o) {
  const shots = WF.homingShots(o.level, o.evo);
  const dmg = WF.homingDamage(o.level, o.evo, o.dmg);
  const chain = WF.homingChain(o.level, o.evo);
  if (!st.alive().length) return false;
  for (let i = 0; i < shots; i++) homingMissile(st, dmg, o.evo, chain, st.agent.x, st.agent.y);
  return true;
}

function homingMissile(st, dmg, evo, chance, sx, sy) {
  let x = sx, y = sy;
  let ang = Math.random() * TAU;      // 게임: 무작위 방향으로 사출된 뒤 즉시 유도가 잡는다
  const speed = 9;
  st.add({
    t: 0, dead: false, layer: 'top',
    update(dt) {
      this.t += dt;
      if (this.t >= 3.5) { this.dead = true; return; }   // HomingMissile.life
      const tgt = st.nearest(x, y, 14);
      if (tgt) {
        const want = Math.atan2(tgt.y - y, tgt.x - x);
        let diff = ((want - ang + Math.PI * 3) % TAU) - Math.PI;
        ang += Math.max(-6 * dt, Math.min(6 * dt, diff));     // 선회 속도 제한
      }
      x += Math.cos(ang) * speed * dt;
      y += Math.sin(ang) * speed * dt;
      for (const e of st.alive()) {
        if ((e.x - x) ** 2 + (e.y - y) ** 2 > (e.radius + 0.2) ** 2) continue;
        const done = e.hit(dmg, false, 0.8, [x, y]);
        if (done >= 1) st.add(fx.damageNumber(e.x, e.y + e.size * 0.5, Math.round(done)));
        // 연쇄 폭발: 명중 자리에서 2발 추가. 연쇄본은 확률 0 이라 다시 갈라지지 않는다.
        if (chance > 0 && Math.random() < chance)
          for (let k = 0; k < 2; k++) homingMissile(st, dmg, evo, 0, x, y);
        if (evo) st.add(fx.cut('cut_missilestorm', x, y, 2.6));
        else st.add(fx.explosion(x, y, 1));
        this.dead = true;
        return;
      }
    },
    draw(ctx, s) {
      // rocket 64×96 = 자연 3유닛(긴 변). 게임 월드 길이 0.6 → 폭 0.4.
      // 비행 화염은 프레임 애니(rocket_)에 이미 들어 있다 — 따로 얹지 않는다(EngineThrust 주석).
      fx.sprite(ctx, s, 'rocket', x, y, { w: 0.4, rot: rotNoseUp(Math.cos(ang), Math.sin(ang)) });
    },
  });
}

// ── 궤도 칼날 ─────────────────────────────────────────────────────────────
class OrbitBlades {
  // 게임 리듬: 대기 → 소환 → 딱 한 바퀴 → 소멸. 상시 도는 게 아니라 한 바퀴가 한 번의 발동이다.
  constructor(st, o) { this.st = st; this.o = o; this.angle = 0; this.sweeping = false; this.rest = 0.4; this.next = new Map(); }
  get total() { return WF.bladeRest(this.o.level, this.o.evo); }
  get left() { return this.sweeping ? 0 : Math.max(0, this.rest); }
  update(dt) {
    const st = this.st, o = this.o;
    if (!this.sweeping) {
      this.rest -= dt;
      if (this.rest > 0) return;
      this.sweeping = true;
      this.angle = 0;
      this.next.clear();
    }
    this.angle += WF.bladeSpeed(o.level, o.evo) * dt;
    if (this.angle >= 360) {
      this.sweeping = false;
      this.rest = WF.bladeRest(o.level, o.evo);
      return;
    }
    const n = WF.bladeCount(o.level, o.evo);
    const r = WF.bladeRadius(o.level, o.evo);
    const dmg = WF.bladeDamage(o.level, o.evo, o.dmg);
    for (let i = 0; i < n; i++) {
      const [bx, by] = this.pos(i, n, r);
      for (const e of st.alive()) {
        if ((e.x - bx) ** 2 + (e.y - by) ** 2 > (e.radius + 0.24) ** 2) continue;
        if (st.time < (this.next.get(e.id) || 0)) continue;
        this.next.set(e.id, st.time + 0.4);          // 같은 적 재타격 0.4초
        const done = e.hit(dmg, false, 0.5, [bx, by]);
        if (done >= 1) st.add(fx.damageNumber(e.x, e.y + e.size * 0.5, Math.round(done)));
      }
    }
  }
  pos(i, n, r) {
    const a = (this.angle + (i * 360) / n) * Math.PI / 180;
    return [this.st.agent.x + Math.cos(a) * r, this.st.agent.y + Math.sin(a) * r];
  }
  drawTop(ctx, st) {
    if (!this.sweeping) return;
    const o = this.o;
    const n = WF.bladeCount(o.level, o.evo), r = WF.bladeRadius(o.level, o.evo);
    // 소환 순간의 스케일 팝(각도 30도까지 커진다). 게임과 같은 등장 리듬.
    const pop = Math.min(1, this.angle / 30);
    // blade 48px = 자연 1.5유닛. 게임 localScale 이 곧 BladeScale 이라 월드 폭 = 1.5 × 스케일.
    const w = 1.5 * WF.bladeScale(o.evo) * pop;
    // 칼날은 단색 실루엣(유저 07-29): 기본 시안, 폭풍 금색. 스프라이트 틴트지 발광 레이어가 아니다.
    const tint = o.evo ? '#ffd14d' : '#2ee8ff';
    for (let i = 0; i < n; i++) {
      const [bx, by] = this.pos(i, n, r);
      fx.sprite(ctx, st, 'blade', bx, by, { w, rot: st.time * (o.evo ? 15.71 : 10.47), tint });
    }
    if (st.showRanges) fx.rangeRing(ctx, st, st.agent.x, st.agent.y, r);
  }
}

// ── 공격형 드론 알파 ──────────────────────────────────────────────────────
class DroneSquad {
  constructor(st, o) { this.st = st; this.o = o; this.spin = 0; this.on = true; this.timer = WF.droneDeploy(o.level); this.fire = 0; }
  get total() { return WF.droneRest(this.o.level); }
  get left() { return this.on ? 0 : Math.max(0, this.timer); }
  update(dt) {
    const st = this.st, o = this.o;
    this.spin += (55 * Math.PI / 180) * dt;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.on = !this.on;
      this.timer = this.on ? WF.droneDeploy(o.level) : WF.droneRest(o.level);
    }
    if (!this.on) return;
    this.fire -= dt;
    if (this.fire > 0) return;
    this.fire = WF.droneFireInterval(o.level, o.evo);
    const n = WF.droneCount(o.level, o.evo);
    const range = WF.droneRange(o.level);
    const dmg = WF.droneDamage(o.level, o.evo, o.dmg);
    for (let i = 0; i < n; i++) {
      const [dx, dy] = this.pos(i, n);
      const tgt = st.nearest(dx, dy, range);
      if (!tgt) continue;
      // BulletFactory.Spawn(…, 18f, 0.18f, …) = 기본 bullet(64px = 2유닛) × 0.18 → 월드 0.36, 흰색.
      bolt(st, dx, dy, Math.atan2(tgt.y - dy, tgt.x - dx), 0, 18, dmg,
        { sprite: 'bullet', w: 0.36, blend: null, range });
      if (o.evo && i === 0) st.add(fx.cut('cut_dronevolley', tgt.x, tgt.y, 2.2));
    }
  }
  pos(i, n) {
    const ang = this.spin + (TAU / n) * i;
    return [this.st.agent.x + Math.cos(ang) * 1.15, this.st.agent.y + Math.sin(ang) * 1.15];
  }
  drawTop(ctx, st) {
    if (!this.on) return;
    const n = WF.droneCount(this.o.level, this.o.evo);
    for (let i = 0; i < n; i++) {
      const [dx, dy] = this.pos(i, n);
      fx.sprite(ctx, st, 'drone', dx, dy, { w: 0.54 });   // 48px 자연 1.5유닛 × localScale 0.36
    }
    if (st.showRanges) fx.rangeRing(ctx, st, st.agent.x, st.agent.y, WF.droneRange(this.o.level));
  }
}

// ── 네온 부메랑 ───────────────────────────────────────────────────────────
function castBoomerang(st, o) {
  const n = WF.boomCount(o.level, o.evo);
  const reach = WF.boomRange(o.level, o.evo);
  const dmg = WF.boomDamage(o.level, o.evo, o.dmg);
  const a = st.agent;
  const base = -a.aim;                       // 화면 각도를 월드 각도로
  // 트윈 사이클론(진화): 투척 순간 요원 앞 0.8 에 쌍회오리. 회수 지점이 아니라 던지는 순간이다.
  if (o.evo) st.add(fx.cut('cut_cyclone', a.x + Math.cos(base) * 0.8, a.y + Math.sin(base) * 0.8, 2.8));
  for (let i = 0; i < n; i++) {
    const spread = (i - (n - 1) * 0.5) * (30 * Math.PI / 180);   // 복수 커터는 30도 부채꼴
    boomerangShot(st, base + spread, reach, dmg, o.evo, o.level);
  }
  return true;
}

function boomerangShot(st, ang, reach, dmg, evo, level) {
  const a = st.agent;
  let x = a.x, y = a.y;
  const maxSpeed = WBAL.boomSpeed;
  let speed = maxSpeed, traveled = 0, returning = false;
  const world = WF.boomSize(level, evo);
  const next = new Map();
  st.add({
    t: 0, dead: false, layer: 'top',
    update(dt) {
      this.t += dt;
      if (!returning) {
        // 진출: 사거리를 쓸수록 느려진다(투척 → 체공). 하한 2.5.
        const v = Math.max(2.5, maxSpeed * fx.clamp01(1 - traveled / reach));
        x += Math.cos(ang) * v * dt;
        y += Math.sin(ang) * v * dt;
        traveled += v * dt;
        if (traveled >= reach) returning = true;
      } else {
        // 귀환: 요원을 추적하며 가속(최대 1.6배). 0.6 안에 들면 회수되고 사라진다.
        const dx = st.agent.x - x, dy = st.agent.y - y, d = Math.hypot(dx, dy);
        if (d < 0.6) { this.dead = true; return; }
        speed = Math.min(maxSpeed * 1.6, speed + 18 * dt);
        x += (dx / d) * speed * dt;
        y += (dy / d) * speed * dt;
      }
      for (const e of st.alive()) {
        if ((e.x - x) ** 2 + (e.y - y) ** 2 > (e.radius + 0.3) ** 2) continue;
        if (this.t < (next.get(e.id) || 0)) continue;
        next.set(e.id, this.t + 0.35);
        const done = e.hit(dmg, false, 0.6, [x, y]);
        if (done >= 1) st.add(fx.damageNumber(e.x, e.y + e.size * 0.5, Math.round(done)));
      }
      if (this.t > 8) this.dead = true;   // 안전장치(요원이 계속 달아나는 경우)
    },
    draw(ctx, s) {
      // boomerang 256px = 자연 8유닛. 월드 크기는 레벨을 탄다(Lv1 0.61 → Lv8 1.03).
      // 스프라이트 자체가 발광이라 게임은 흰 틴트만 쓴다 — 진화만 하늘색.
      fx.sprite(ctx, s, 'boomerang', x, y, { w: world, rot: this.t * 12.57, tint: evo ? '#b3ffff' : null });
    },
  });
}

// ── 지원형 드론 델타 ──────────────────────────────────────────────────────
class SupportDrone {
  constructor(st, o) { this.st = st; this.o = o; this.spin = 0; this.timer = WF.supInterval(o.level); }
  get total() { return WF.supInterval(this.o.level); }
  get left() { return Math.max(0, this.timer); }
  pos() {
    const st = this.st;
    return [st.agent.x + Math.cos(this.spin) * 1.7, st.agent.y + Math.sin(this.spin) * 1.7];
  }
  update(dt) {
    this.spin += (50 * Math.PI / 180) * dt;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = WF.supInterval(this.o.level);
    const st = this.st;
    const [dx, dy] = this.pos();
    // 회복 연출 = 링 펄스 두 겹뿐이다. 요원 자리에 큰 초록 펄스, 드론 자리에 작은 방출.
    st.add(fx.ringPulse(st.agent.x, st.agent.y, 0.3, 1.2, '#66ff9e', 0.9, 0.45));
    st.add(fx.ringPulse(dx, dy, 0.1, 0.5, '#80ffb3', 0.8, 0.3));
    // 보급 링 컷은 진화(지원 드론 군단) 전용이다.
    if (this.o.evo) st.add(fx.cut('cut_supportpulse', st.agent.x, st.agent.y, 3.2));
  }
  drawTop(ctx, st) {
    const [x, y] = this.pos();
    fx.sprite(ctx, st, 'drone', x, y, { w: 0.54, tint: '#8cffb3' });   // 초록 틴트(회복 정체성)
  }
}

// ── 코어 쉴드 ─────────────────────────────────────────────────────────────
class CoreShield {
  constructor(st, o) { this.st = st; this.o = o; this.on = false; this.timer = 0.6; }
  get total() { return WF.shieldPeriod(this.o.level); }
  get left() { return this.on ? 0 : Math.max(0, this.timer); }
  update(dt) {
    const st = this.st, o = this.o;
    this.timer -= dt;
    if (!this.on) {
      if (this.timer > 0) return;
      this.on = true;
      this.timer = WF.shieldDuration(o.level);
      st.add(fx.ringPulse(st.agent.x, st.agent.y, 0.4, 1.9, '#59ebff', 0.95, 0.32));   // 생성 확장 펄스
      return;
    }
    // 한 대 맞으면 그 자리에서 깨진다. 무대에는 피격이 없으므로 적이 닿는 순간을 피격으로 본다.
    const touch = st.nearest(st.agent.x, st.agent.y, 0.75);
    if (touch || this.timer <= 0) {
      this.on = false;
      this.timer = WF.shieldPeriod(o.level);
      if (touch) {
        // 깨짐: 안으로 수축하는 흰 섬광 + 반사 임팩트(NotifyBlocked 그대로).
        st.add(fx.ringPulse(st.agent.x, st.agent.y, 1.6, 0.3, '#ffffff', 0.95, 0.22));
        st.add(fx.cut('cut_reflect', st.agent.x, st.agent.y, 2.4));
        st.shake(6, 0.1);
      }
    }
  }
  drawTop(ctx, st) {
    if (!this.on) return;
    // lv_core_shield 를 월드 지름 2.7 로 깔고, 알파만 8Hz 로 흔든다(게임 색 0.3/0.9/1).
    const alpha = 0.35 + 0.22 * Math.abs(Math.sin(st.time * 8));
    fx.sprite(ctx, st, 'lv_core_shield', st.agent.x, st.agent.y, { w: 2.7, alpha, tint: '#4de6ff' });
  }
}

// ── 등록표 ────────────────────────────────────────────────────────────────
export const DEFS = {
  Chain: { total: (o) => F.chainInterval(o.level, o.evo), cast: castChain },
  Explode: { total: (o) => F.explodeInterval(o.level, o.evo), cast: castExplode },
  Split: { total: (o) => F.splitInterval(o.level, o.evo), cast: castSplit },
  FireField: { custom: FireField },
  FrostAura: { total: (o) => F.frostCooldown(o.level, o.evo), cast: castFrost },
  Orbital: { total: (o) => F.orbitalInterval(o.level), cast: castOrbital },
  Mine: { total: (o) => F.mineInterval(o.level), cast: castMine },
  MineBreak: { total: (o) => F.breakInterval(o.level), cast: castMineBreak },
  Gravity: { total: (o) => F.gravityInterval(o.level), cast: castGravity },
  Pulse: { total: (o) => F.pulseInterval(o.level), cast: castPulse },
  Timeslow: { total: (o) => F.timeslowInterval(o.level), cast: castTimeslow },
  Repair: { total: () => 8, cast: castRepair, note: '전투 중 발동이 없다. 무대에서는 웨이브 종료를 8초 주기로 흉내 낸다.' },
  ReflectBall: { total: (o) => F.reflectBallInterval(o.level), cast: castReflectBall },
  IonGrenade: { total: (o) => F.ionInterval(o.level), cast: castIon },
  CloneDroid: { total: (o) => F.cloneInterval(o.level), cast: castClone },
  Sentry: { total: (o) => F.sentryInterval(o.level), cast: castSentry },

  // 드래프트 무기 7종
  BombWeapon: { total: (o) => WF.bombInterval(o.level, o.evo), cast: castBomb },
  HomingWeapon: { total: (o) => WF.homingInterval(o.level, o.evo), cast: castHoming },
  OrbitalWeapon: { custom: OrbitBlades },
  DroneWeapon: { custom: DroneSquad },
  BoomerangWeapon: { total: (o) => WF.boomInterval(o.level), cast: castBoomerang },
  SupportDroneWeapon: { custom: SupportDrone },
  CoreShieldSkill: { custom: CoreShield },
};

/** 선택한 스킬 하나를 무대 위에서 굴리는 구동기. 쿨 관리와 발동만 한다. */
export class Runtime {
  constructor(stage, id, opts) {
    this.st = stage;
    this.id = id;
    this.def = DEFS[id];
    this.o = { level: 1, evo: false, dmg: 20, ...opts };
    this.timer = 0.35;                       // 무대에 올리자마자 한 번 보여 준다
    this.impl = this.def.custom ? new this.def.custom(stage, this.o) : null;
  }

  setOpts(patch) {
    Object.assign(this.o, patch);
    if (this.def.custom) this.impl = new this.def.custom(this.st, this.o);
    this.timer = Math.min(this.timer, 0.35);
  }

  /** 발동 주기. 부속·기어의 쿨타임 감소(Gear.CooldownMul)가 여기 곱해진다 — 게임의 소비 지점과 같다. */
  get total() { return (this.impl ? this.impl.total : this.def.total(this.o)) * (this.o.cdMul ?? 1); }
  get left() { return this.impl ? this.impl.left : Math.max(0, this.timer); }

  fireNow() {
    if (this.impl) return;
    this.def.cast(this.st, this.o);
    this.timer = this.total;
  }

  update(dt) {
    if (this.impl) { this.impl.update(dt); return; }
    this.timer -= dt;
    if (this.timer > 0) return;
    // 표적이 없어 발동에 실패하면 게임과 같이 0.4초 뒤 재시도한다.
    this.timer = this.def.cast(this.st, this.o) ? this.total : 0.4;
  }

  draw(ctx, st) { if (this.impl && this.impl.draw) this.impl.draw(ctx, st); }
  drawTop(ctx, st) { if (this.impl && this.impl.drawTop) this.impl.drawTop(ctx, st); }
}
