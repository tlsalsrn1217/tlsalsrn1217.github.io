// 화면 조립. 여기서 만드는 건 셋뿐이다: 왼쪽 출격 준비 · 오른쪽 3탭 · 정비 상점.
//
// UI 원칙(유저: "복잡하고 어렵지 않게"):
//   1. 한 줄에 하나만 묻는다. 라벨 → 조작 → **바뀐 결과**를 같은 줄에서 보여 준다.
//      값을 바꿨는데 무엇이 달라졌는지 다른 데를 봐야 하면 그때부터 도구가 아니라 설정 화면이다.
//   2. 개발 용어를 안 쓴다. hpMul 이 아니라 "체력 배수", statP 가 아니라 "장비 파워".
//   3. 자주 만지는 것이 위다. 요원·무기·장비가 맨 위, 잘 안 바꾸는 계정 레벨이 아래.
import * as B from './balance.js';
import * as meta from './meta.js';
import { SHIPS, WEAPONS, EQUIP, RESEARCH, TIER_NAMES, SLOTS, SLOT_NAMES, GEAR,
         equipBySlot, equipById, weaponById } from './defs.js';
import { OFFER_WEIGHT, maxLevelOf, itemById, SUPPLIES } from './run.js';
import { nextSteps } from './costs.js';
import { SHOP_ITEMS } from './defs.js';
import { byId as catalogById, levelLine } from './catalog.js';

const SHOP_ITEMS_ALL = SHOP_ITEMS;
/** 스킬 한 줄 설명 — 카탈로그가 레벨별 문구를 준다. 없는 스킬은 빈 줄. */
const levelLineOf = (def, lv) => { try { return levelLine(def, lv); } catch { return ''; } };

// ── 작은 DOM 빌더 ──────────────────────────────────────────────────────────
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const n1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
const n2 = (v) => (Math.round(v * 100) / 100).toFixed(2);
const pct = (v) => Math.round(v * 100) + '%';
export const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** 라벨 + 조작 + 결과 한 줄. 이 도구의 기본 단위다. */
function field(label, control, result, help) {
  return h('label', { class: 'field' },
    h('span', { class: 'flabel' }, label),
    control,
    result != null ? h('span', { class: 'fresult num' }, result) : null,
    help ? h('span', { class: 'fhelp' }, help) : null);
}

// 드래그 중인 슬라이더 한 개. 이 노브가 든 화면을 replaceChildren 으로 갈아 끼우면
// 브라우저가 잡고 있던 노드를 잃어서 드래그가 끊긴다 = 한 칸 움직이고 멈춘다.
// 그래서 드래그 중에는 그 화면만 다시 그리지 않고, 옆에 붙은 숫자만 새로 계산해 덮는다.
let dragEl = null;
const dropDrag = () => { dragEl = null; };
globalThis.addEventListener?.('pointerup', dropDrag);
globalThis.addEventListener?.('pointercancel', dropDrag);

/** 모든 range 입력은 이걸 거친다 — 드래그 추적을 한 곳에만 둔다. */
function range(attrs) {
  return h('input', { ...attrs, type: 'range', onpointerdown: (e) => { dragEl = e.currentTarget; } });
}

function slider(value, min, max, step, oninput) {
  return range({ min, max, step, value, oninput });
}

/** root 를 다시 그린다. 단, 드래그 중인 노브가 그 안에 있으면 숫자만 덮어쓴다. */
function paint(root, build) {
  if (dragEl && root.contains?.(dragEl)) {
    const tmp = document.createElement('div');
    build(tmp);
    const now = root.querySelectorAll('.fresult, .num');
    const next = tmp.querySelectorAll('.fresult, .num');
    if (now.length === next.length) now.forEach((el, i) => { el.textContent = next[i].textContent; });
    return;
  }
  root.replaceChildren();
  build(root);
}

// ── 좌: 출격 준비 ──────────────────────────────────────────────────────────
export function renderRail(root, app) { paint(root, (r) => railBody(r, app)); }
function railBody(root, app) {
  const lo = app.loadout;

  // 스테이지
  root.append(section('스테이지', [
    field('맵',
      h('select', { onchange: (e) => app.setLoadout({ planet: +e.target.value }) },
        ...B.D().planets.map((p, i) => h('option', { value: i, selected: i === lo.planet },
          `${i + 1}. ${p.name}`))),
      `난이도 ${n2(B.planet(lo.planet).difficulty)}`),
    h('p', { class: 'note' },
      `적 체력 배수 ${n2(B.planet(lo.planet).difficulty)} · 피해 배수 ${n2(B.planet(lo.planet).dmgScale)}` +
      (lo.planet === 0 ? ' · 첫 맵이라 런 길이가 60%다' : '')),
  ]));

  // 요원 + 무기
  root.append(section('요원과 무기', [
    field('요원',
      h('select', { onchange: (e) => app.setLoadout({ shipName: e.target.value }) },
        ...SHIPS.map((s) => h('option', { value: s.name, selected: s.name === lo.shipName },
          `${s.ko} (${s.grade})`))),
      `체력 ${Math.round(meta.shipDef(lo.shipName).maxHP)}`),
    field('요원 레벨',
      slider(lo.shipLevel, 0, B.D().growth.shipLvMax, 1, (e) => app.setLoadout({ shipLevel: +e.target.value })),
      `Lv ${lo.shipLevel} · 전 능력치 +${Math.round(B.D().growth.shipStatPerLv * lo.shipLevel * 100)}%`),
    field('주무기',
      h('select', { onchange: (e) => app.setWeapon(+e.target.value) },
        ...WEAPONS.map((w) => h('option', { value: w.itemId, selected: w.itemId === lo.weaponId },
          `${w.name} · ${w.archetype}`))),
      weaponLine(lo.weaponId)),
    h('p', { class: 'note' }, `${weaponById(lo.weaponId).fireLine} · 기동성 ${n2(weaponById(lo.weaponId).mobility)}배 · 해금 레벨 ${weaponById(lo.weaponId).unlockLevel}`),
  ]));

  // 장비 4슬롯
  root.append(section('장비', SLOTS.map((slot) => equipRow(app, slot)).concat(
    h('p', { class: 'note' }, '등급을 올리면 성능이 크게, 강화는 완만하게 오른다. 무기 슬롯은 위에서 고른 주무기와 같은 것을 끼우는 게 기본이다.'))));

  // 연구
  root.append(section('연구', [
    ...RESEARCH.map((d) => field(d.name,
      slider(lo.research[d.id], 0, d.maxLevel, 1, (e) => {
        const r = lo.research.slice(); r[d.id] = +e.target.value; app.setLoadout({ research: r });
      }),
      `Lv ${lo.research[d.id]} · +${n1(d.perLevel * lo.research[d.id])}${d.suffix}`)),
    h('div', { class: 'quickrow' },
      h('button', { class: 'ghost sm', onclick: () => app.setLoadout({ research: [0, 0, 0, 0, 0, 0] }) }, '전부 0'),
      h('button', { class: 'ghost sm', onclick: () => app.setLoadout({ research: RESEARCH.map((d) => Math.round(d.maxLevel / 2)) }) }, '절반'),
      h('button', { class: 'ghost sm', onclick: () => app.setLoadout({ research: RESEARCH.map((d) => d.maxLevel) }) }, '만렙')),
  ]));

  // 계정 레벨
  root.append(section('파일럿 레벨', [
    field('레벨',
      slider(lo.accountLevel, 1, B.D().account.maxLevel, 1, (e) => app.setLoadout({ accountLevel: +e.target.value })),
      `Lv ${lo.accountLevel} · 투자분 ×${n2(1 + B.D().account.statPerLevel * (lo.accountLevel - 1))}`),
    h('p', { class: 'note' }, '요원 기본치가 아니라 **투자해서 늘어난 만큼**에만 곱해진다. 장비와 연구가 0이면 레벨을 올려도 이득이 없다.'),
  ]));
}

function weaponLine(id) {
  const w = weaponById(id);
  return `피해 ×${n2(w.damageMul)}`;
}

function section(title, kids) {
  return h('section', { class: 'railsec' }, h('h3', {}, title), ...[].concat(kids));
}

function equipRow(app, slot) {
  const e = app.loadout.equip[slot] || { id: null, tier: 0, level: 0 };
  const list = equipBySlot(slot);
  const P = e.id == null ? 0 : meta.statP(e.tier, e.level);
  return h('div', { class: 'equiprow' },
    h('div', { class: 'eqline' },
      h('span', { class: 'flabel' }, SLOT_NAMES[slot]),
      h('select', {
        onchange: (ev) => app.setEquip(slot, { id: ev.target.value === '' ? null : +ev.target.value }),
      },
        h('option', { value: '', selected: e.id == null }, '없음'),
        ...list.map((it) => h('option', { value: it.id, selected: it.id === e.id }, it.name))),
      h('span', { class: 'fresult num' }, e.id == null ? '-' : `파워 ${P}`)),
    e.id == null ? null : h('div', { class: 'eqline sub' },
      h('select', { onchange: (ev) => app.setEquip(slot, { tier: +ev.target.value }) },
        ...TIER_NAMES.map((t, i) => h('option', { value: i, selected: i === e.tier }, t))),
      slider(e.level, 0, 5, 1, (ev) => app.setEquip(slot, { level: +ev.target.value })),
      h('span', { class: 'fresult num' }, `+${e.level}`)),
    e.id == null ? null : h('p', { class: 'eqmods' },
      equipById(e.id).mods.map((m) => `${statName(m.stat)} ${modAmount(m.stat, m.w, P)}`).join(' · ')));
}

const STAT_NAME = {
  Damage: '공격력', FireRate: '연사', Crit: '치명타 확률', CritDmg: '치명타 피해', Cooldown: '쿨타임 감소',
  MaxHp: '최대 체력', Armor: '방어력', MoveSpeed: '이동 속도', CellDrop: '셀 드롭률', ScrapGain: '셀 획득량',
  Discount: '정비 할인',
};
export const statName = (s) => STAT_NAME[s] || s;

/** 장비 한 축이 실제로 주는 양(EquipCatalog 기준율 × 파워 × 가중치). */
function modAmount(stat, w, P) {
  const R = { Damage: 1.0, Crit: 0.02, CritDmg: 0.05, MaxHp: 15, Armor: 0.5, MoveSpeed: 0.055, CellDrop: 0.05, ScrapGain: 0.05 };
  if (stat === 'FireRate') return `+${Math.round((1 / Math.pow(0.97, P * w) - 1) * 100)}%`;
  if (stat === 'Cooldown') return `-${Math.round((1 - Math.pow(0.992, P * w)) * 100)}%`;
  const v = (R[stat] || 0) * P * w;
  if (stat === 'Crit' || stat === 'CellDrop' || stat === 'ScrapGain') return `+${Math.round(v * 100)}%`;
  if (stat === 'CritDmg') return `+${Math.round(v * 100)}%`;
  if (stat === 'MoveSpeed') return `+${n2(v)}`;
  return `+${Math.round(v)}`;
}

// ── 능력치 요약 ────────────────────────────────────────────────────────────
const STAT_ROWS = [
  ['최대 체력', (s) => Math.round(s.maxHP)],
  ['공격력', (s) => Math.round(s.damage)],
  ['발당 피해', (s, app) => n1(require_mc(app).shotDamage(s, app.run ? app.run.cannonLv : 1, false))],
  ['초당 피해', (s, app) => n1(dps(s, app))],
  ['발사 간격', (s, app) => n2(require_mc(app).interval(s, app.run ? app.run.cannonLv : 1, false)) + '초'],
  ['사거리', (s) => n2(s.range * 0.56) + ' 유닛'],
  ['관통', (s, app) => String(s.pierce + require_mc(app).pierceBonus(app.run ? app.run.cannonLv : 1, false))],
  ['이동 속도', (s) => n2(s.moveSpeed)],
  ['치명타', (s) => `${Math.round(s.critChance * 100)}% · ×${n2(s.critMult)}`],
  // 값이 두 토막인 줄은 한 칸을 통째로 쓴다 — 두 칸 격자에 우겨 넣으면 줄바꿈이 나서 오히려 안 읽힌다.
  ['방어', (s) => `정률 ${Math.round(s.defense * 100)}% · 흡수 ${n1(s.armor)}`, 'wide'],
  ['셀 수급', (s) => `드롭 ×${n2(s.cellDropMul)} · 획득 ×${n2(s.xpMul)}`, 'wide'],
];
let MCref = null;
export const bindMC = (mc) => { MCref = mc; };
const require_mc = () => MCref;

function dps(s, app) {
  const lv = app.run ? app.run.cannonLv : 1;
  const shots = MCref.shots(s, lv);
  const per = MCref.shotDamage(s, lv, false) * 0.9 * s.damageMul * (1 + s.critChance * (s.critMult - 1));
  return (shots * per) / MCref.interval(s, lv, false);
}

export function renderStats(root, app) {
  const s = app.stats;
  root.replaceChildren(...STAT_ROWS.map(([label, get, wide]) =>
    h('div', { class: 'statrow' + (wide ? ' wide' : '') },
      h('span', {}, label), h('b', { class: 'num' }, get(s, app)))));
}

/** 출처 확인 창 — 조립 단계마다 능력치가 얼마가 되는지. 어디서 붙은 값인지 눈으로 짚는 표다. */
export function renderSource(root, app) {
  const cols = [['체력', (t) => Math.round(t.maxHP)], ['공격', (t) => Math.round(t.damage)],
                ['이동', (t) => t.moveSpeed.toFixed(2)], ['연사', (t) => t.fireInterval.toFixed(3)]];
  root.replaceChildren(
    h('div', { class: 'srcrow srchead' }, h('span', {}, '단계'), ...cols.map(([c]) => h('b', {}, c))),
    ...meta.breakdown(app.loadout).map((r) =>
      h('div', { class: 'srcrow' }, h('span', {}, r.name), ...cols.map(([, get]) => h('b', {}, get(r.stats))))));
}

/** 판이 끝난 뒤 결과판 — 한 줄에 수치 하나. 어느 값이 나빴는지 세로로 훑어 찾는 자리다. */
export function renderResult(root, app, cleared) {
  const r = app.run, d = app.stage.dps;
  const min = Math.max(1 / 60, r.timeAlive / 60);
  const num = (v) => Math.round(v).toLocaleString();
  const rows = [
    ['전투'],
    ['도달 웨이브', `${r.wave.waveNo} / ${r.wave.total}`],
    ['생존 시간', mmss(r.timeAlive)],
    ['처치', num(r.kills)],
    ['분당 처치', num(r.kills / min)],
    ['이어하기', `${r.revives || 0}회`],
    [],
    ['피해'],
    ['총 데미지', num(d.total)],
    ['평균 DPS', num(d.total / Math.max(1, r.timeAlive))],
    ['최고 DPS', num(d.peak)],
    ['받은 피해', num(d.taken)],
    ['주포', `Lv ${r.cannonLv}`],
    ['보유 스킬과 무기', `${Object.values(r.skills).filter((v) => v > 0).length}종`],
    [],
    ['수입'],
    ['획득 셀', num(r.cellsEarned)],
    ['분당 셀', num(r.cellsEarned / min)],
    ['남은 셀', num(r.cells)],
    ['점수', num(r.score)],
    ['코인', cleared ? num(r.coins) : '0 (판을 끝내야 돈이 된다)'],
    ['젬', num(r.gems)],
  ];
  root.replaceChildren(...rows.map(([k, v]) =>
    k == null ? h('div', { class: 'rgap' })
      : v == null ? h('div', { class: 'rsec' }, k)
        : h('div', { class: 'rrow' }, h('span', {}, k + ':'), h('b', {}, v))));
}

// ── 우 탭 ─────────────────────────────────────────────────────────────────
export function renderTab(root, app) { paint(root, (r) => tabBody(r, app)); }
function tabBody(root, app) {
  if (app.tab === 'run') return renderRunTab(root, app);
  if (app.tab === 'tune') return renderTuneTab(root, app);
  return renderEcoTab(root, app);
}

function renderRunTab(root, app) {
  const run = app.run;
  root.append(h('p', { class: 'note' }, '전투 중 얻는 것들이다. 정비 상점에서 산 부속과 스킬이 여기 쌓이고, 즉시 반영된다.'));

  // 웨이브 골라 뛰기
  root.append(section2('웨이브', [
    h('div', { class: 'wavegrid' }, ...B.waves().map((w) => h('button', {
      class: 'wavebtn' + (run && run.wave.waveNo === w.id ? ' on' : '') + (w.type !== 'normal' ? ' ' + w.type : ''),
      title: `${w.type} · ${w.dur}초 · 예산 ${w.count} · 동시 ${w.cap}`,
      onclick: () => app.jumpToWave(w.id),
    }, w.id))),
    h('p', { class: 'note' }, '누르면 그 웨이브부터 시작한다. 후반 난이도를 보려고 앞을 다 뛸 필요는 없다.'),
  ]));

  if (!run) return;

  // 주포
  root.append(section2('주포', [
    field('강화 단계',
      slider(run.cannonLv, 1, 10, 1, (e) => { run.cannonLv = +e.target.value; run.recompute(); app.refresh(); }),
      `Lv ${run.cannonLv} · 피해 ×${n2(MCref.damageMul(run.cannonLv, false))} · 연사 ×${n2(1 / MCref.intervalMul(run.cannonLv, false))}`),
    h('label', { class: 'chk' },
      h('input', { type: 'checkbox', checked: run.cannonEvo, onchange: (e) => { run.cannonEvo = e.target.checked; run.recompute(); app.refresh(); } }),
      ' 진화(트라이던트 캐논)'),
  ]));

  // 보유 스킬
  root.append(section2('보유 스킬과 무기', [
    h('div', { class: 'ownedgrid' }, ...Object.keys(OFFER_WEIGHT).map((k) => {
      const lv = run.skills[k] | 0, max = maxLevelOf(k);
      return h('div', { class: 'owned' + (lv ? ' on' : '') },
        h('span', { class: 'oname' }, skillLabel(k)),
        range({ min: 0, max, step: 1, value: lv,
          oninput: (e) => { run.skills[k] = +e.target.value; run.recompute(); app.refresh(); } }),
        h('b', { class: 'num' }, `${lv}/${max}`));
    })),
  ]));

  // 기어
  root.append(section2('부속 기어', [
    h('div', { class: 'ownedgrid' }, ...GEAR.map((g) => {
      const lv = run.gear[g.g] | 0;
      return h('div', { class: 'owned' + (lv ? ' on' : '') },
        h('span', { class: 'oname', title: g.desc }, g.name),
        range({ min: 0, max: g.max, step: 1, value: lv,
          oninput: (e) => { run.gear[g.g] = +e.target.value; run.recompute(); app.refresh(); } }),
        h('b', { class: 'num' }, `${lv}/${g.max}`));
    })),
    h('p', { class: 'note' }, '고폭탄두와 원소 증폭기는 게임에서도 지금은 효과가 없다. 2026-08-03에 폭발·지속피해의 출처가 전부 부속으로 옮겨 가면서 카드 문구만 남았다.'),
  ]));

  // 직접 덮어쓰기
  const OV = [
    ['내 체력', 'hp'], ['내 공격력', 'dmg'], ['내 이동', 'move'], ['내 연사', 'fire'],
    ['적 체력', 'enemyHp'], ['적 공격력', 'enemyDmg'], ['적 속도', 'enemySpeed'],
  ];
  root.append(section2('직접 덮어쓰기', [
    h('p', { class: 'note' }, '편성으로는 못 만드는 가정을 세울 때 쓴다. 게임에는 없는 축이라 1이면 아무 일도 안 한다. 적 쪽은 이 뒤에 새로 나오는 적부터 적용된다.'),
    ...OV.map(([label, key]) => field(label,
      slider(Math.round(run.override[key] * 100), 10, 400, 5, (e) => {
        run.override[key] = +e.target.value / 100;
        run.recompute(); app.refresh();
      }),
      `×${n2(run.override[key])}`)),
    h('button', { class: 'ghost sm', onclick: () => {
      for (const [, k] of OV) run.override[k] = 1;
      run.recompute(); app.refresh();
    } }, '전부 1로'),
  ]));

  // 보유 부속
  const owned = Object.entries(run.items).filter(([, n]) => n > 0);
  root.append(section2('보유 부속', owned.length
    ? [h('div', { class: 'chips' }, ...owned.map(([id, n]) => {
        const it = itemById(id);
        return h('span', { class: 'chip' }, `${it ? it.name : id} ×${n}`,
          h('button', { class: 'x', onclick: () => { delete run.items[id]; run.recompute(); app.refresh(); } }, '×'));
      }))]
    : [h('p', { class: 'note' }, '아직 없다. 웨이브가 끝나면 정비 상점이 열린다.')]));
}

const SKILL_LABEL = {
  Chain: '라이트닝 체인', Explode: '관통 로켓', FireField: '플라즈마 필드', FrostAura: '빙결 레이저',
  Gravity: '중력장 우물', Split: '분열탄', Orbital: '궤도 위성포', Repair: '야전 수복 장치',
  Mine: '지뢰', MineBreak: '파쇄 지뢰', Timeslow: '시간 지연 펄스', Pulse: '충격 펄스',
  BombWeapon: '강화 로켓', HomingWeapon: '유도 미사일', OrbitalWeapon: '궤도 칼날',
  DroneWeapon: '공격형 드론 알파', BoomerangWeapon: '네온 부메랑',
  SupportDroneWeapon: '지원형 드론 델타', CoreShieldSkill: '코어 쉴드',
};
export const skillLabel = (k) => SKILL_LABEL[k] || k;

function section2(title, kids) {
  return h('section', { class: 'tabsec' }, h('h3', {}, title), ...[].concat(kids));
}

// ── 수치 편집기 ────────────────────────────────────────────────────────────
// balance.json 을 통째로 펼치면 300줄이라 아무도 안 읽는다. 실제로 만지는 묶음만 앞에 세우고
// 나머지는 검색으로 찾게 한다.
const TUNE_GROUPS = [
  { title: '적 기본치', note: '전 종·전 맵에 한꺼번에 걸린다. 여기 하나를 만지면 판 전체가 움직인다.',
    keys: ['spawn.baseHpConst', 'spawn.baseHpDiffScale', 'spawn.baseSpeedConst', 'spawn.baseSpeedDiffMax', 'spawn.maxAlive'] },
  { title: '웨이브 곡선', note: '웨이브가 하나 넘어갈 때마다 곱해지는 값이다. 1.17이면 14웨이브에서 체력이 8.6배가 된다.',
    keys: ['spawn.waveHpGrowth', 'spawn.waveDmgGrowth'] },
  { title: '실력 보정', note: '다 쓸어버리면 올라가고 쌓이면 내려간다. 폭을 열면 잘하는 플레이어가 벌받는 고무줄이 된다.',
    keys: ['spawn.skillAdjMin', 'spawn.skillAdjMax', 'spawn.skillAdjUp', 'spawn.skillAdjDown', 'spawn.skillAdjLeftoverFrac'] },
  { title: '보스', note: '기본 체력에 곱해지는 배수다.', keys: ['spawn.bossMidHpMul', 'spawn.bossFinalHpMul'] },
  { title: '수입', note: '처치당 셀이 나올 확률과 값이다. 물가(상점 가격)와 짝이라 한쪽만 만지면 구매력이 깨진다.',
    keys: ['economy.cellDropChance', 'economy.cellDropValueMul', 'economy.clearBonusBase', 'economy.clearRepeatFrac', 'economy.gemRewardFirstClear'] },
  { title: '상점 물가', note: '스킬·주포·리롤·칸 확장 값. 부속 가격은 코드 표(ShopCatalog)에 있어 여기서 안 바뀐다.',
    keys: ['shop.skillBasePrice', 'shop.skillBasePriceCannon', 'shop.cannonPriceMul', 'shop.rerollBase', 'shop.rerollStep', 'shop.itemDupPriceStep', 'shop.slotExpandCost', 'shop.itemOfferMin', 'shop.itemOfferMax'] },
];

const TUNE_LABEL = {
  'spawn.baseHpConst': '기본 체력 상수', 'spawn.baseHpDiffScale': '난이도 체력 배수',
  'spawn.baseSpeedConst': '기본 속도 상수', 'spawn.baseSpeedDiffMax': '난이도 속도 상한', 'spawn.maxAlive': '동시 등장 하드캡',
  'spawn.waveHpGrowth': '웨이브당 체력 성장', 'spawn.waveDmgGrowth': '웨이브당 피해 성장',
  'spawn.skillAdjMin': '보정 하한', 'spawn.skillAdjMax': '보정 상한', 'spawn.skillAdjUp': '전멸 시 상승',
  'spawn.skillAdjDown': '잔존 시 하락', 'spawn.skillAdjLeftoverFrac': '잔존 판정 비율',
  'spawn.bossMidHpMul': '지휘관 체력 배수', 'spawn.bossFinalHpMul': '최종보스 체력 배수',
  'economy.cellDropChance': '셀 드롭 확률', 'economy.cellDropValueMul': '셀 값 배수',
  'economy.clearBonusBase': '클리어 코인 기본', 'economy.clearRepeatFrac': '반복 클리어 비율',
  'economy.gemRewardFirstClear': '첫 클리어 젬',
  'shop.skillBasePrice': '스킬 기본가', 'shop.skillBasePriceCannon': '주포 기본가',
  'shop.cannonPriceMul': '주포 인상률', 'shop.rerollBase': '리롤 기본가', 'shop.rerollStep': '리롤 인상폭',
  'shop.itemDupPriceStep': '부속 재구매 인상', 'shop.slotExpandCost': '칸 확장 값',
  'shop.itemOfferMin': '부속 매물 최소', 'shop.itemOfferMax': '부속 매물 최대',
};

function renderTuneTab(root, app) {
  root.append(h('p', { class: 'note' },
    '게임의 balance.json 을 그대로 읽어 왔다. 여기서 바꾼 값은 이 창에서만 살아 있고 게임 파일은 안 건드린다. 다 만졌으면 위쪽 내보내기로 받아서 옮긴다.'));

  for (const g of TUNE_GROUPS) {
    root.append(section2(g.title, [
      h('p', { class: 'note' }, g.note),
      ...g.keys.map((k) => tuneField(app, k, TUNE_LABEL[k] || k)),
    ]));
  }

  // 웨이브 표
  root.append(section2('웨이브 표', [
    h('p', { class: 'note' }, '한 웨이브의 예산(마릿수)·길이·동시 상한·체력 배수. 예산은 밀릴 뿐 사라지지 않으므로 총량이 곧 이 판의 수입 상한이다.'),
    h('div', { class: 'tablewrap' }, waveTable(app)),
  ]));

  // 행성 표
  root.append(section2('맵 6칸', [
    h('p', { class: 'note' }, '난이도는 적 체력에, 피해 배수는 접촉·탄 피해에 곱해진다. 맵을 고르는 건 왼쪽 스테이지 칸이다.'),
    h('div', { class: 'tablewrap' }, planetTable(app)),
  ]));

  // 적 표
  root.append(section2('적 종별 배수', [
    h('p', { class: 'note' }, '기본 체력·속도·피해에 곱해지는 종별 배수다. 크기와 셀 값은 코드 표라 여기서 안 바뀐다.'),
    h('div', { class: 'tablewrap' }, enemyTable(app)),
  ]));

  // 바뀐 값
  const d = B.diff();
  root.append(section2(`바뀐 값 ${d.length}`, d.length
    ? [h('div', { class: 'difflist' }, ...d.map((x) => h('div', { class: 'diffrow' },
        h('code', {}, x.path),
        h('span', { class: 'num' }, `${fmtVal(x.from)} → ${fmtVal(x.to)}`),
        h('button', { class: 'link', onclick: () => { B.reset(x.path); app.refresh(); } }, '되돌리기'))))]
    : [h('p', { class: 'note' }, '원본 그대로다.')]));
}

const fmtVal = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? v : n2(v)) : String(v));

function tuneField(app, path, label) {
  const cur = B.get(path), org = B.original(path);
  const changed = B.changed(path);
  const step = Number.isInteger(org) ? 1 : org < 2 ? 0.001 : 0.01;
  return h('label', { class: 'field tune' + (changed ? ' changed' : '') },
    h('span', { class: 'flabel' }, label),
    h('input', {
      type: 'number', value: cur, step,
      onchange: (e) => { B.set(path, +e.target.value); app.refresh(); },
    }),
    changed
      ? h('button', { class: 'link', onclick: () => { B.reset(path); app.refresh(); } }, `↩ ${fmtVal(org)}`)
      : h('span', { class: 'fhelp' }, path));
}

function waveTable(app) {
  const cols = [['id', '번호'], ['type', '종류'], ['dur', '길이'], ['count', '예산'], ['cap', '동시'], ['min', '바닥'], ['hpMul', '체력배수'], ['surge', '서지']];
  return h('table', { class: 'dtable' },
    h('thead', {}, h('tr', {}, ...cols.map(([, t]) => h('th', {}, t)))),
    h('tbody', {}, ...B.waves().map((w) => h('tr', {},
      ...cols.map(([k]) => h('td', {},
        k === 'id' || k === 'type'
          ? String(w[k])
          : h('input', {
              type: 'number', class: 'cell' + (B.changed(`waves.${w.id}.${k}`) ? ' changed' : ''),
              value: w[k], step: k === 'hpMul' ? 0.01 : 1,
              onchange: (e) => { B.set(`waves.${w.id}.${k}`, +e.target.value); app.refresh(); },
            })))))));
}

function planetTable(app) {
  const cols = [['name', '맵'], ['difficulty', '난이도'], ['dmgScale', '피해 배수'], ['coinPerKill', '코인 배수'], ['unlockScore', '해금 점수']];
  return h('table', { class: 'dtable' },
    h('thead', {}, h('tr', {}, ...cols.map(([, t]) => h('th', {}, t)))),
    h('tbody', {}, ...B.D().planets.map((p, i) => h('tr', {},
      ...cols.map(([k]) => h('td', {},
        k === 'name' ? p.name : h('input', {
          type: 'number', class: 'cell' + (B.changed(`planets.${i}.${k}`) ? ' changed' : ''),
          value: p[k], step: k === 'unlockScore' ? 10000 : k === 'coinPerKill' ? 1 : 0.05,
          onchange: (ev) => { B.set(`planets.${i}.${k}`, +ev.target.value); app.refresh(); },
        })))))));
}

function enemyTable(app) {
  const cols = [['kind', '종'], ['hpMul', '체력'], ['speedMul', '속도'], ['dmgMul', '피해'], ['score', '점수']];
  return h('table', { class: 'dtable' },
    h('thead', {}, h('tr', {}, ...cols.map(([, t]) => h('th', {}, t)))),
    h('tbody', {}, ...B.D().enemies.map((e) => h('tr', {},
      ...cols.map(([k]) => h('td', {},
        k === 'kind' ? e.kind : h('input', {
          type: 'number', class: 'cell' + (B.changed(`enemies.${e.kind}.${k}`) ? ' changed' : ''),
          value: e[k], step: k === 'score' ? 1 : 0.01,
          onchange: (ev) => { B.set(`enemies.${e.kind}.${k}`, +ev.target.value); app.refresh(); },
        })))))));
}

// ── 경제 리포트 ────────────────────────────────────────────────────────────
function renderEcoTab(root, app) {
  const run = app.run;
  root.append(h('p', { class: 'note' },
    '이 판에서 돈이 얼마나 들어오고 나갔나. 셀은 판 안에서만 쓰고, 코인은 판을 끝내야 생긴다 — 죽으면 0이다.'));

  const est = estimateIncome(app);
  root.append(section2('예상 수입(계산)', [
    kvList([
      ['런 총 스폰 예산', `${est.budget} 마리`],
      ['처치당 기대 셀', n2(est.perKill)],
      ['예상 총 셀', `${Math.round(est.total)}`],
      ['드롭 확률', pct(est.chance)],
      ['셀 획득 배수', `×${n2(est.gain)}`],
    ]),
    h('p', { class: 'note' }, '실제 수입은 이 값보다 낮다. 자석 밖에 떨어진 셀과 화면 상한에 막혀 못 나온 예산만큼 빠진다.'),
  ]));

  root.append(section2('다음 한 칸의 값', [
    h('p', { class: 'note' }, '게임 밖 성장 비용이다. 한 판 코인 수입과 나란히 놓고 보면 "몇 판을 돌아야 하나"가 나온다.'),
    h('div', { class: 'tablewrap' }, h('table', { class: 'dtable' },
      h('thead', {}, h('tr', {}, ...['올릴 것', '코인', '모듈', '판'].map((x) => h('th', {}, x)))),
      h('tbody', {}, ...nextSteps(app.loadout).filter((r) => !r.capped).map((r) => h('tr', {},
        h('td', {}, r.what),
        h('td', { class: 'num' }, r.coin.toLocaleString()),
        h('td', { class: 'num' }, r.module ? String(r.module) : '-'),
        h('td', { class: 'num' }, app.lastCoins > 0 ? Math.ceil(r.coin / app.lastCoins) + '판' : '-')))))),
  ]));

  root.append(section2('누적 지갑', [
    kvList([
      ['돌린 판', app.wallet.runs],
      ['모은 코인', app.wallet.coins.toLocaleString()],
      ['모은 젬', app.wallet.gems],
      ['판당 평균 코인', app.wallet.runs ? Math.round(app.wallet.coins / app.wallet.runs) : 0],
    ]),
    h('button', { class: 'ghost sm', onclick: () => { app.wallet = { coins: 0, gems: 0, runs: 0 }; app.refresh(); } }, '지갑 비우기'),
  ]));

  if (!run || !run.ledger.length) {
    root.append(section2('실측', [h('p', { class: 'note' }, '아직 웨이브를 끝내지 않았다. 한 판 돌리면 여기 웨이브별 수지가 쌓인다.')]));
    return;
  }

  root.append(section2('웨이브별 수지', [
    ledgerChart(run.ledger),
    h('div', { class: 'tablewrap' }, h('table', { class: 'dtable' },
      h('thead', {}, h('tr', {}, ...['웨이브', '종류', '획득 셀', '지갑', '누적 처치', '경과'].map((t) => h('th', {}, t)))),
      h('tbody', {}, ...run.ledger.map((r) => h('tr', {},
        h('td', {}, r.wave), h('td', {}, r.type), h('td', { class: 'num' }, r.earned),
        h('td', { class: 'num' }, r.wallet), h('td', { class: 'num' }, r.kills), h('td', { class: 'num' }, mmss(r.time))))))),
  ]));

  root.append(section2('합계', [
    kvList([
      ['획득 셀', run.cellsEarned],
      ['지출 셀', run.spent],
      ['남은 셀', run.cells],
      ['처치', run.kills],
      ['점수', run.score.toLocaleString()],
      ['생존', mmss(run.timeAlive)],
      ['결과 코인', run.coins ?? '-'],
    ]),
  ]));
}

function estimateIncome(app) {
  const eco = B.D().economy, s = app.stats;
  const engine = app.run ? app.run.wave : null;
  const budget = engine ? engine.totalBudget() : B.waves().reduce((n, w) => n + w.count, 0);
  const chance = Math.min(1, eco.cellDropChance * s.cellDropMul);
  // 편성 평균 셀 값 — 웨이브 표의 종별 가중치로 낸다.
  let sum = 0, all = 0;
  for (const w of B.waves()) for (const c of w.comp) {
    const a = (app.arch(c.kind) || {}).cell || 1;
    sum += a * c.w * w.count; all += c.w * w.count;
  }
  const avgCell = all > 0 ? sum / all : 1;
  const perKill = avgCell * chance * s.xpMul * eco.cellDropValueMul;
  return { budget, chance, gain: s.xpMul, perKill, total: perKill * budget };
}

function kvList(rows) {
  return h('div', { class: 'kvlist' }, ...rows.map(([k, v]) =>
    h('div', { class: 'kv' }, h('span', {}, k), h('b', { class: 'num' }, String(v)))));
}

/** 웨이브별 획득 셀 막대. SVG 한 장이라 의존성이 없다. */
function ledgerChart(ledger) {
  const W = 340, H = 120, pad = 18;
  const max = Math.max(1, ...ledger.map((r) => r.earned));
  const bw = (W - pad * 2) / ledger.length;
  const bars = ledger.map((r, i) => {
    const bh = ((H - pad * 2) * r.earned) / max;
    return `<rect x="${pad + i * bw + 1}" y="${H - pad - bh}" width="${bw - 2}" height="${bh}" rx="2" fill="${r.type === 'boss' ? '#ffc24a' : r.type === 'horde' ? '#ff7a6b' : '#2de8ff'}" opacity=".85"/>`;
  }).join('');
  const labels = ledger.map((r, i) => `<text x="${pad + i * bw + bw / 2}" y="${H - 5}" text-anchor="middle" font-size="9" fill="#6b7d97">${r.wave}</text>`).join('');
  return h('div', { class: 'chart', html:
    `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="웨이브별 획득 셀">
       <line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="#2c3950"/>
       ${bars}${labels}
       <text x="${pad}" y="${pad - 4}" font-size="10" fill="#9fb0c8">최대 ${max}셀</text>
     </svg>` });
}

// ── 정비 상점 ──────────────────────────────────────────────────────────────
export function renderShop(root, app) { paint(root, (r) => shopBody(r, app)); }

/** 상점 한 줄 — 게임의 매물 행과 같은 문법(아이콘 · 이름/효과 · 가격 칩). */
function shopRow({ icon, name, tag, line, pips, price, can, buy, banner, chipText }) {
  return h('div', { class: 'srow' + (banner ? ' banner' : '') + (can ? '' : ' dim') },
    h('div', { class: 'ic' }, icon ? h('img', { src: `/res/${icon}.png`, alt: '' }) : null),
    h('div', { class: 'tx' },
      h('div', { class: 'n' }, name, tag ? h('i', {}, tag) : null),
      line ? h('div', { class: 'e' }, line) : null,
      pips ? h('div', { class: 'pips' }, ...Array.from({ length: pips.max },
        (_, i) => h('i', { class: i < pips.lv ? 'on' : '' }))) : null),
    h('button', {
      class: 'chip' + (can ? '' : ' off'), disabled: !can, onclick: buy,
    }, can ? h('span', { class: 'cellico', 'aria-hidden': 'true' }) : null,
       chipText || String(price)));
}

const sectionHead = (title, right) =>
  h('div', { class: 'sh' }, h('div', { class: 't' }, title), right || null);

function rerollChip(run, app) {
  const price = run.rerollPrice();
  return h('button', {
    class: 'ghostchip', disabled: run.cells < price,
    onclick: () => { run.reroll(); app.refresh(); },
  }, h('span', { class: 'cellico', 'aria-hidden': 'true' }), `새로고침 ${price}`);
}

function shopBody(root, app) {
  const run = app.run;
  if (!run.offers) run.rollOffers();
  const all = app.shopAll;
  if (app.shopTab === 'goods') goodsTab(root, app, run, all);
  else skillTab(root, app, run, all);
}

function skillTab(root, app, run, all) {
  // 주포 = 칸 밖 고정 배너. 매 회차 무제한(게임 07-31).
  const cp = run.cannonPrice();
  root.append(shopRow({
    icon: 'bullet', banner: true, name: '주무기 강화',
    tag: run.cannonLv < 10 ? `Lv${run.cannonLv}→${run.cannonLv + 1}` : '만렙',
    line: `피해 ×${n2(MCref.damageMul(run.cannonLv + 1, false))} · 연사 ×${n2(1 / MCref.intervalMul(run.cannonLv + 1, false))} · 관통 +${MCref.pierceBonus(run.cannonLv + 1, false)}`,
    pips: { lv: run.cannonLv, max: 10 },
    price: cp, can: run.cannonLv < 10 && run.cells >= cp,
    chipText: run.cannonLv >= 10 ? '만렙' : null,
    buy: () => { run.buyCannon(); app.refresh(); },
  }));

  const keys = all ? Object.keys(OFFER_WEIGHT) : run.offers.skills;
  root.append(sectionHead(all ? `전 항목 ${keys.length}종` : '이번 매물',
    all ? null : rerollChip(run, app)));
  for (const k of keys) {
    const price = run.skillPrice(k);
    const lv = run.skills[k] | 0, max = maxLevelOf(k);
    const def = catalogById(k);
    root.append(shopRow({
      icon: def?.icon, name: skillLabel(k),
      tag: lv === 0 ? '신규' : lv >= max ? '만렙' : `Lv${lv}→${lv + 1}`,
      line: def ? levelLineOf(def, Math.min(lv + 1, max)) : `만렙 ${max}`,
      pips: { lv, max },
      price, can: lv < max && run.cells >= price,
      chipText: lv >= max ? '만렙' : null,
      buy: () => { run.buySkill(k); app.refresh(); },
    }));
  }
}

function goodsTab(root, app, run, all) {
  // 내 스텟 = 게임 물자 탭 맨 위 축 요약. 무엇이 이미 붙었는지 보고 다음을 고른다.
  const st = run.stats, base = meta.build(app.loadout);   // 런 밖 기본치 = 비교 기준
  const axes = [
    ['공격력', pct(st.damage / Math.max(1, base.damage) - 1)],
    ['최대 체력', '+' + Math.round(st.maxHP - base.maxHP)],
    ['이동속도', pct(st.moveSpeed / Math.max(0.01, base.moveSpeed) - 1)],
    ['셀 획득', pct((st.cellDropMul || 1) - 1)],
    ['상점 할인', pct(1 - (st.shopDiscountMul || 1))],
  ];
  root.append(sectionHead('내 스텟'));
  root.append(h('div', { class: 'axis' }, ...axes.map(([k, v]) =>
    h('div', {}, h('div', { class: 'k' }, k),
      h('div', { class: 'v' + (v === '0%' || v === '+0' ? ' z' : '') }, v)))));

  const items = all ? SHOP_ITEMS_ALL : run.offers.items;
  root.append(sectionHead(all ? `부속 전 항목 ${items.length}종` : '이번 매물',
    all ? null : rerollChip(run, app)));
  for (const it of items) {
    const price = run.itemPrice(it);
    const have = run.items[it.id] | 0;
    root.append(shopRow({
      icon: it.icon, name: it.name, tag: have ? `보유 ${have}` : null,
      line: it.mods.map((m) => `${statName(m.stat)} ${m.stat === 'MaxHp' || m.stat === 'Armor' ? '+' + m.v : '+' + Math.round(m.v * 100) + '%'}`).join(' · '),
      price, can: run.cells >= price,
      buy: () => { run.buyItem(it.id); app.refresh(); },
    }));
  }

  root.append(sectionHead('보급'));
  for (const sp of SUPPLIES) {
    const left = run.supplyStock[sp.kind] | 0;
    const price = run.pay(sp.price);
    root.append(shopRow({
      icon: sp.icon, name: sp.name, tag: `남은 ${left}`, line: sp.desc,
      price, can: left > 0 && run.cells >= price,
      chipText: left > 0 ? null : '품절',
      buy: () => { run.buySupply(sp.kind); app.refresh(); },
    }));
  }

  const gears = all ? GEAR.map((g) => g.g) : run.offers.gear;
  root.append(sectionHead(all ? `부속 기어 전 ${gears.length}종` : '부속 기어'));
  for (const g of gears) {
    const def = GEAR.find((x) => x.g === g);
    const lv = run.gear[g] | 0;
    const price = Math.max(1, Math.round(B.D().shop.skillBasePrice * (lv + 1) * 0.8 * run.stats.shopDiscountMul));
    root.append(shopRow({
      icon: def.icon, name: def.name,
      tag: lv >= def.max ? '만렙' : `Lv${lv}→${lv + 1}`,
      line: def.desc, pips: { lv, max: def.max },
      price, can: lv < def.max && run.cells >= price,
      chipText: lv >= def.max ? '만렙' : null,
      buy: () => { run.buyGear(g); app.refresh(); },
    }));
  }
}

/** 장착 도크 = 지금 무엇을 끼고 있나. 게임은 스크롤 밖에 고정해 둔다(유저 08-01). */
export function renderDock(root, app) {
  const run = app.run;
  const owned = Object.keys(run.skills).filter((k) => (run.skills[k] | 0) > 0);
  root.replaceChildren(
    h('div', { class: 'lab' }, `보유 스킬과 무기 ${owned.length}`),
    h('div', { class: 'slots' }, ...(owned.length ? owned : [null]).map((k) => k
      ? h('div', { class: 'slot', title: skillLabel(k) },
          h('img', { src: `/res/${catalogById(k)?.icon || 'bullet'}.png`, alt: '' }),
          h('b', {}, run.skills[k]))
      : h('div', { class: 'slot empty' }))));
}
