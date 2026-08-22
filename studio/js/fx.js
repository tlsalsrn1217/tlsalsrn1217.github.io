// 그리기 원시 도구. 게임의 연출 문법을 캔버스로 옮긴 최소 집합이다.
//
// 좌표는 전부 월드 유닛이고 화면 변환은 Stage 가 한다. 여기 있는 함수는
// "이 월드 좌표에 이 크기로 그려라"만 안다 — 카메라가 움직여도 코드가 안 바뀐다.
//
// 월드 크기 환산 규칙(게임과 동일): 스프라이트 픽셀 / 32 = PPU32 기준 자연 크기(유닛).
// 예) 160px 조각 = 5유닛. 게임 코드가 localScale 로 쓰는 값이 곧 이 자연 크기의 배수다.

const cache = new Map();

/** Resources 스프라이트 한 장. 서버가 게임 폴더에서 바로 읽어 준다. */
export function img(name) {
  let e = cache.get(name);
  if (!e) {
    e = new Image();
    e.src = '/res/' + name + '.png';
    cache.set(name, e);
  }
  return e;
}

export const ready = (im) => im && im.complete && im.naturalWidth > 0;

/** 스프라이트 자연 크기(유닛) — PPU 32 기준. */
export const natural = (im) => (ready(im) ? im.naturalWidth / 32 : 0);

export const CYAN = '#2de8ff';
export const MINT = '#6bffd0';
export const AMBER = '#ffb13d';
export const ICE = '#9ad9ff';

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rnd = (a, b) => a + Math.random() * (b - a);

/**
 * 월드 좌표에 스프라이트를 그린다.
 * @param o.w 월드 폭(유닛). 안 주면 자연 크기.
 * @param o.rot 라디안. 0 = 스프라이트 위쪽이 월드 위쪽.
 * @param o.blend 'lighter' 면 가산 합성(게임의 발광 레이어와 같은 읽힘).
 */
export function sprite(ctx, st, name, wx, wy, o = {}) {
  const im = img(name);
  if (!ready(im)) return;
  const nat = im.naturalWidth / 32;
  const w = o.w == null ? nat : o.w;
  const h = w * (im.naturalHeight / im.naturalWidth);
  const [sx, sy] = st.toScreen(wx, wy);
  const pw = w * st.ppu, ph = h * st.ppu;
  ctx.save();
  ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
  if (o.blend) ctx.globalCompositeOperation = o.blend;
  ctx.translate(sx, sy);
  if (o.rot) ctx.rotate(o.rot);
  if (o.flipY) ctx.scale(1, -1);
  if (o.flipX) ctx.scale(-1, 1);
  if (o.tint) {
    // 틴트가 필요한 조각은 오프스크린에서 물들인 뒤 그린다.
    // tintMul = 유니티 SpriteRenderer.color 와 같은 곱연산(원본 명암이 남는다).
    // 기본은 단색 덮어쓰기 — 발광 오버레이는 명암이 남으면 안 빛나 보인다.
    ctx.drawImage(tinted(im, o.tint, o.tintMul), -pw / 2, -ph / 2, pw, ph);
  } else {
    ctx.drawImage(im, -pw / 2, -ph / 2, pw, ph);
  }
  ctx.restore();
}

const tintCache = new Map();
function tinted(im, color, mul) {
  const key = im.src + color + (mul ? 'x' : '');
  let c = tintCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(im, 0, 0);
  g.globalCompositeOperation = mul ? 'multiply' : 'source-atop';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  if (mul) {   // multiply 는 투명한 곳도 칠한다 — 원본 알파로 다시 오려낸다.
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(im, 0, 0);
  }
  tintCache.set(key, c);
  return c;
}

/** 컷 시퀀스(cut_xxx_0 .. _16) 한 프레임. 게임의 SpriteSequencePlayer 와 같은 규칙. */
export function seqFrame(ctx, st, key, wx, wy, worldSize, t, fps, o = {}) {
  const i = Math.floor(t * fps);
  if (i > 16) return false;
  sprite(ctx, st, `${key}_${i}`, wx, wy, { w: worldSize, blend: 'lighter', ...o });
  return true;
}

/** 채운 원. 반경은 월드 유닛. */
export function disc(ctx, st, wx, wy, r, fill, alpha = 1) {
  const [sx, sy] = st.toScreen(wx, wy);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(sx, sy, r * st.ppu, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 외곽선 원. 게임의 조준 링(RingSprite)과 같은 읽힘. */
/**
 * 사거리/범위 확인용 링. 게임 이펙트가 아니라 도구의 자다 — 이펙트와 헷갈리지 않게
 * 점선으로 긋고, 어두운 바닥에서도 보이도록 뒤에 검은 띠를 한 겹 깐다.
 */
export function rangeRing(ctx, st, wx, wy, r, color = CYAN, alpha = 1) {
  const [sx, sy] = st.toScreen(wx, wy);
  const rr = r * st.ppu;
  ctx.save();
  ctx.beginPath(); ctx.arc(sx, sy, rr, 0, Math.PI * 2);
  ctx.globalAlpha = 0.45 * alpha; ctx.strokeStyle = '#000'; ctx.lineWidth = 9; ctx.stroke();
  ctx.globalAlpha = 0.95 * alpha; ctx.strokeStyle = color; ctx.lineWidth = 3;
  ctx.setLineDash([16, 12]); ctx.stroke();
  ctx.restore();
}

export function ring(ctx, st, wx, wy, r, color, alpha = 1, lw = 3, blend) {
  const [sx, sy] = st.toScreen(wx, wy);
  ctx.save();
  ctx.globalAlpha = alpha;
  if (blend) ctx.globalCompositeOperation = blend;
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.arc(sx, sy, r * st.ppu, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * 플라즈마 필드 원판. 게임은 절차 생성 텍스처를 쓴다(경계 링만 또렷, 속은 거의 투명).
 * 그 픽셀 규칙을 그대로 캔버스 그라디언트로 옮긴다.
 */
export function plasmaDisc(ctx, st, wx, wy, r, alpha, spin) {
  const [sx, sy] = st.toScreen(wx, wy);
  const R = r * st.ppu;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(sx, sy);
  ctx.rotate(spin);
  // 내부 스캔라인 — 원본의 sin(dn*44) 동심 무늬를 성긴 링 다발로 근사한다.
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = 1;
  ctx.globalAlpha = alpha * 0.35;
  for (let i = 1; i <= 7; i++) {
    ctx.beginPath();
    ctx.arc(0, 0, R * (i / 7.6), 0, Math.PI * 2);
    ctx.stroke();
  }
  // 보조 링(dn 0.88) + 피해 경계 링(dn 0.965)
  ctx.globalAlpha = alpha * 0.9;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, R * 0.88, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = alpha * 1.7;   // 원본 텍스처의 경계 링 피크(0.88)를 가산 합성 기준으로 환산한 값
  ctx.lineWidth = Math.max(2, R * 0.035);
  ctx.beginPath(); ctx.arc(0, 0, R * 0.965, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

/**
 * 들쭉날쭉한 전류 선. 게임 LightningArc 와 같은 규칙:
 * 세그먼트 12, 진폭 = 길이의 일부(상한 있음), 수명 따라 진폭과 굵기가 잦아든다.
 */
export function boltPath(ax, ay, bx, by, decay, segs = 12) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 0.001;
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux;
  const amp = Math.min(0.55, len * 0.14) * decay;
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const f = i / segs;
    const off = i === 0 || i === segs ? 0 : (Math.random() - 0.5) * 2 * amp;
    pts.push([ax + dx * f + px * off, ay + dy * f + py * off]);
  }
  return pts;
}

/**
 * @param worldWidth 월드 굵기. 게임 LightningArc.Width 가 0.18 이고 수명 따라
 *   0.35 + 0.65 x decay 로 얇아진다. 그 규칙을 그대로 쓴다.
 */
export function drawBolt(ctx, st, pts, decay, color = '#9ad9ff', worldWidth = 0.18) {
  const w = worldWidth * st.ppu;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const pass of [[1, 0.22, color], [0.5, 0.55, color], [0.2, 1, '#ffffff']]) {
    ctx.lineWidth = Math.max(1, w * pass[0] * (0.35 + 0.65 * decay));
    ctx.globalAlpha = pass[1] * decay;
    ctx.strokeStyle = pass[2];
    ctx.beginPath();
    pts.forEach((p, i) => {
      const [x, y] = st.toScreen(p[0], p[1]);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
  }
  ctx.restore();
}

// ── 짧은 연출 조각 ────────────────────────────────────────────────────────
// 전부 { t, dead, update(dt), draw(ctx, st) } 한 가지 모양이다. Stage 가 목록으로 굴린다.

/** 사망 폭발 확대판. 게임 규칙상 스킬 폭발은 전부 이 조각을 키워 쓴다(컷 시퀀스 금지). */
export function explosion(wx, wy, sizeMul = 1) {
  const life = sizeMul > 1.5 ? 0.45 : 0.3;
  return {
    t: 0, dead: false,
    update(dt) { this.t += dt; if (this.t >= life) this.dead = true; },
    draw(ctx, st) {
      const k = clamp01(this.t / life);
      // ExplosionFx: localScale = (0.2 + k*0.35) * sizeMul, 자연 크기 2유닛
      sprite(ctx, st, 'explosion', wx, wy, { w: 2 * (0.2 + k * 0.35) * sizeMul, alpha: 1 - k, blend: 'lighter' });
    },
  };
}

/** 컷 시퀀스 재생 조각(cut_storm, cut_inferno, cut_frost, cut_nova, cut_absolute). */
export function cut(key, wx, wy, worldSize, fps = 24, o = {}) {
  const last = (o.frames || 17) - 1;   // 프레임이 17장보다 적은 시퀀스(hrocket_boom 9장)는 일찍 닫는다
  return {
    t: 0, dead: false,
    update(dt) { this.t += dt; if (this.t * fps > last) this.dead = true; },
    draw(ctx, st) { seqFrame(ctx, st, key, wx, wy, worldSize, this.t, fps, o); },
  };
}

/**
 * 방전 임팩트. 게임 BuildSkills.SpawnZap 그대로다: 3변주 중 랜덤 + 회전 360도 + X 미러 + 스케일 ±15%.
 * 한 종류를 그대로 쓰면 같은 그림이 도배돼서 사슬이 길어질수록 싸구려로 읽힌다.
 */
const ZAP_KEYS = ['cut_zap_a', 'cut_zap_b', 'cut_zap_c'];
export function zap(wx, wy, size) {
  const key = ZAP_KEYS[Math.floor(Math.random() * ZAP_KEYS.length)];
  return cut(key, wx, wy, size * rnd(0.85, 1.15), 26, {
    rot: Math.random() * Math.PI * 2,
    flipX: Math.random() < 0.5,
  });
}

/** 확산 링(pulse_ring). 자연 크기 5유닛 조각이 피해 지름까지 커진다. */
export function pulseRing(wx, wy, radius, dur = 0.35) {
  return {
    t: 0, dead: false,
    update(dt) { this.t += dt; if (this.t >= dur) this.dead = true; },
    draw(ctx, st) {
      const p = clamp01(this.t / dur);
      sprite(ctx, st, 'pulse_ring', wx, wy, { w: 2 * radius * (0.25 + 0.75 * p), alpha: 1 - p * p, blend: 'lighter' });
    },
  };
}

/**
 * 절차적 확장 링(게임 RingPulse 그대로). 회복·방어막 발동/파괴가 전부 이 조각을 쓴다.
 * 64px 링 스프라이트(밴드 7px)를 반지름 r 로 스케일하므로 두께도 r 에 비례한다.
 * 커지는 속도는 sqrt 감속 — 초반에 확 퍼지고 끝에서 느려진다.
 */
export function ringPulse(wx, wy, startR, endR, color, alpha = 0.9, life = 0.4) {
  return {
    t: 0, dead: false,
    update(dt) { this.t += dt; if (this.t >= life) this.dead = true; },
    draw(ctx, st) {
      const k = Math.sqrt(clamp01(this.t / life));
      const r = lerp(startR, endR, k);
      ring(ctx, st, wx, wy, r, color, alpha * (1 - k), Math.max(1, (7 / 32) * r * st.ppu));
    },
  };
}

/** 반사 스파크 — 0.18초 확대 후 소멸. */
export function spark(wx, wy) {
  const rot = Math.random() * Math.PI * 2;
  return {
    t: 0, dead: false,
    update(dt) { this.t += dt; if (this.t >= 0.18) this.dead = true; },
    draw(ctx, st) {
      const k = clamp01(this.t / 0.18);
      sprite(ctx, st, 'reflect_spark', wx, wy, { w: 3 * 0.38 * (0.5 + k * 0.5), rot, alpha: 1 - k, blend: 'lighter' });
    },
  };
}

/** 떠오르는 숫자. 피해가 실제로 들어갔음을 읽히게 한다. */
export function damageNumber(wx, wy, value, color = '#ffffff') {
  return {
    t: 0, dead: false,
    update(dt) { this.t += dt; if (this.t >= 0.7) this.dead = true; },
    draw(ctx, st) {
      const k = clamp01(this.t / 0.7);
      const [sx, sy] = st.toScreen(wx, wy - k * 0.55);
      ctx.save();
      ctx.globalAlpha = 1 - k * k;
      ctx.font = '700 34px Pretendard, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(3,7,14,.9)';
      ctx.strokeText(value, sx, sy);
      ctx.fillStyle = color;
      ctx.fillText(value, sx, sy);
      ctx.restore();
    },
  };
}
