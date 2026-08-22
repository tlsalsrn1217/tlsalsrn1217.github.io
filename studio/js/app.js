// 앱 뼈대 — 데이터를 읽고, 무대를 돌리고, 화면을 다시 그린다. 판단은 전부 다른 모듈이 한다.
import * as B from './balance.js';
import * as meta from './meta.js';
import * as ui from './ui.js';
import { MC } from './formulas.js';
import { arch } from './waves.js';
import { Stage } from './stage.js';
import { Run } from './run.js';

const $ = (s) => document.querySelector(s);

const app = {
  loadout: meta.defaultLoadout(),
  stats: null,
  stage: null,
  run: null,
  tab: 'run',
  shopTab: 'skill',   // 상점 폴더 탭(스킬/물자) — 게임과 같은 두 칸
  shopAll: false,     // 전 항목 보기(도구 전용)
  speed: 1,
  paused: false,
  arch,
  /** 판을 넘겨 쌓이는 지갑. 게임의 GameData 를 흉내 낸 것 — 메타 성장 속도를 재는 자리다. */
  wallet: { coins: 0, gems: 0, runs: 0 },
  lastCoins: 0,

  setLoadout(patch) {
    Object.assign(this.loadout, patch);
    if (patch.planet != null && this.stage) this.stage.setPlanet(patch.planet);
    this.rebuild();
  },

  /** 무기를 바꾸면 무기 슬롯 장비도 같은 것으로 따라간다 — 게임에서 둘은 같은 아이템이다. */
  setWeapon(id) {
    this.loadout.weaponId = id;
    if (this.loadout.equip.Weapon) this.loadout.equip.Weapon.id = id;
    else this.loadout.equip.Weapon = { id, tier: 0, level: 0 };
    this.rebuild();
  },

  setEquip(slot, patch) {
    const cur = this.loadout.equip[slot];
    if (patch.id === null) { this.loadout.equip[slot] = null; }
    else this.loadout.equip[slot] = { ...(cur || { tier: 0, level: 0 }), ...patch };
    if (slot === 'Weapon' && patch.id != null) this.loadout.weaponId = patch.id;
    this.rebuild();
  },

  /** 편성이 바뀌면 스탯을 다시 접는다. 런 중이면 런 레이어까지 다시 얹는다. */
  rebuild() {
    this.stats = this.run ? this.run.recompute() : meta.build(this.loadout);
    if (!this.run && this.stage) this.stage.applyStats(this.stats);
    this.refresh();
  },

  refresh() {
    ui.renderRail($('#railBody'), this);
    ui.renderStats($('#statList'), this);
    ui.renderTab($('#tabBody'), this);
    if (this.run && this.run.shopOpen) {
      ui.renderShop($('#shopBody'), this);
      ui.renderDock($('#shopDock'), this);
      this.paintShopHead();
    }
    if (!$('#srcPop').hidden) ui.renderSource($('#srcBody'), this);
    const d = B.diff();
    const badge = $('#dirtyBadge');
    badge.hidden = d.length === 0;
    badge.querySelector('b').textContent = d.length;
    $('#shopCells').textContent = this.run ? this.run.cells : 0;
  },

  start() {
    this.stage.setPlanet(this.loadout.planet);
    this.run = new Run(this.stage, this.loadout);
    this.run.onShopOpen = () => this.openShop();
    this.run.onFinish = (cleared) => this.showCurtain(cleared);
    this.run.begin();
    this.stats = this.run.stats;
    this.paused = false;
    this.hideCurtain();
    this.refresh();
  },

  /** 그 웨이브부터 시작한다. 앞 웨이브를 다 뛰지 않고 후반을 보려는 용도다. */
  jumpToWave(id) {
    if (!this.run) this.start();
    const r = this.run;
    r.shopOpen = false;
    $('#shop').hidden = true;
    this.stage.enemies.length = 0;
    this.stage.gems.length = 0;
    this.stage.bullets.length = 0;
    r.wave.reset();
    r.wave.running = true;
    r.wave.startWave(id - 1);
    r.over = false; r.cleared = false;
    this.stage.agent.dead = false;
    this.stage.agent.hp = this.stage.agent.maxHp;
    this.hideCurtain();
    this.refresh();
  },

  openShop() {
    $('#shop').hidden = false;
    this.paintShopHead();
    ui.renderShop($('#shopBody'), this);
    this.refresh();
  },

  /** 상점 머리 = 정비 회차 · 다음 웨이브 · 눈금 · 지갑. 게임 헤더와 같은 정보다. */
  paintShopHead() {
    const w = this.run.wave;
    $('#shopCycle').textContent = `${w.waveNo} / ${w.total}`;
    $('#shopNext').textContent = Math.min(w.waveNo + 1, w.total);
    const ticks = $('#shopTicks');
    if (ticks.children.length !== w.total) {
      ticks.replaceChildren(...Array.from({ length: w.total }, () => document.createElement('i')));
    }
    [...ticks.children].forEach((el, i) => el.classList.toggle('on', i < w.waveNo));
    for (const b of $('#shopTabs').children) b.classList.toggle('on', b.dataset.stab === this.shopTab);
    $('#shopTabs').classList.toggle('goods', this.shopTab === 'goods');
  },

  closeShop() {
    $('#shop').hidden = true;
    this.run.closeShop();
    this.refresh();
  },

  hideCurtain() {
    $('#curtain').hidden = true;
    $('#curtainTitle').hidden = true;
    $('#curtainStats').hidden = true;
    $('#reviveBtn').hidden = true;
  },

  /**
   * 이어하기 — 죽은 자리에서 판을 계속한다. 웨이브 예산은 그대로라 남은 물량도 그대로 온다.
   * 겹쳐 있던 적은 치운다. 안 치우면 살아나자마자 같은 접촉 피해로 다시 죽어 아무것도 못 본다.
   */
  revive() {
    const r = this.run;
    if (!r || !r.over) return;
    r.over = false;
    r.revives = (r.revives || 0) + 1;
    const a = this.stage.agent;
    a.dead = false;
    a.hp = a.maxHp;
    a.iframeT = 3;
    a.contactStreak = 0;
    this.stage.enemies = this.stage.enemies.filter((e) => Math.hypot(e.x - a.x, e.y - a.y) > 6);
    this.paused = false;
    this.hideCurtain();
    this.refresh();
  },

  showCurtain(cleared) {
    const r = this.run;
    this.wallet.runs++;
    this.wallet.coins += r.coins || 0;
    this.wallet.gems += r.gems || 0;
    this.lastCoins = r.coins || 0;
    $('#curtain').hidden = false;
    const title = $('#curtainTitle');
    title.hidden = false;
    title.textContent = cleared ? '스테이지 클리어' : '사망';
    title.className = cleared ? 'clear' : 'dead';
    const stats = $('#curtainStats');
    stats.hidden = false;
    ui.renderResult(stats, this, cleared);
    // 이어하기는 죽었을 때만. 클리어한 판에 이어 붙일 것은 없다.
    $('#reviveBtn').hidden = cleared;
    $('#curtainBtn').textContent = '테스트 다시하기';
    this.tab = 'eco';
    syncTabs();
    this.refresh();
  },
};

// ── 부팅 ───────────────────────────────────────────────────────────────────
// 콘솔에서 만질 수 있게 열어 둔다(__app.run.cells = 9999 처럼). 자동 검사도 이 통로로 들여다본다.
globalThis.__app = app;
await B.load();
ui.bindMC(MC);
app.stage = new Stage($('#stage'));
app.stage.setPlanet(app.loadout.planet);
app.stats = meta.build(app.loadout);
app.stage.applyStats(app.stats);
app.refresh();

// ── 조작 ───────────────────────────────────────────────────────────────────
// **e.key 가 아니라 e.code 를 읽는다.** e.key 는 입력기가 만들어 낸 글자라, 한글 입력 상태에서
// W 를 누르면 'ㅈ' 이 들어온다 = 이동이 통째로 죽는다. e.code 는 자판 위의 물리 위치라
// 한글이든 영문이든 Dvorak 이든 같은 값이 온다.
const keys = new Set();
addEventListener('keydown', (e) => {
  // 글자를 치는 칸에서만 비킨다. 체크박스(무적/자동 이동/범위 표시)나 슬라이더를 한 번 누르면
  // 거기에 포커스가 남는데, 그것까지 막으면 그 뒤로 이동이 죽는다.
  if (e.target.matches('textarea, select, input:not([type=checkbox]):not([type=radio]):not([type=range])')) return;
  // 화살표는 포커스 잡힌 슬라이더 몫이다(값 미세 조정). WASD 는 그래도 움직인다.
  if (e.target.matches('input[type=range]') && e.code.startsWith('Arrow')) return;
  if (e.code === 'Space') { e.preventDefault(); togglePause(); return; }
  if (e.code === 'Tab') { e.preventDefault(); if (app.run && !app.run.shopOpen) app.openShop(); return; }
  if (MOVE_CODES.has(e.code)) e.preventDefault();   // 방향키가 페이지를 스크롤하지 않게
  keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
// 창을 벗어나면 누르고 있던 키가 영영 안 풀린다(계속 한쪽으로 걸어간다).
addEventListener('blur', () => keys.clear());
document.addEventListener('visibilitychange', () => keys.clear());

const MOVE_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);
const down = (...codes) => (codes.some((c) => keys.has(c)) ? 1 : 0);

function readInput() {
  app.stage.input.x = down('KeyD', 'ArrowRight') - down('KeyA', 'ArrowLeft');
  app.stage.input.y = down('KeyW', 'ArrowUp') - down('KeyS', 'ArrowDown');
}

function togglePause() {
  app.paused = !app.paused;
  $('#pauseBtn').textContent = app.paused ? '재개' : '일시정지';
}

const startRun = (e) => { e?.currentTarget?.blur?.(); app.start(); };
$('#startBtn').onclick = startRun;
$('#curtainBtn').onclick = startRun;
$('#reviveBtn').onclick = (e) => { e.currentTarget.blur(); app.revive(); };
$('#pauseBtn').onclick = togglePause;
$('#killBtn').onclick = () => { if (app.run && app.run.wave.running) app.run.wave.endWave(); };
$('#godChk').onchange = (e) => { app.stage.godMode = e.target.checked; };
$('#autoChk').onchange = (e) => { app.stage.control = e.target.checked ? 'auto' : 'keys'; };
$('#rangeChk').onchange = (e) => { app.stage.showRanges = e.target.checked; };
$('#propChk').onchange = (e) => { app.stage.showProps = e.target.checked; };
$('#speedRange').oninput = (e) => {
  app.speed = +e.target.value / 100;
  $('#speedNum').textContent = app.speed.toFixed(1) + '배';
};
$('#shopTabs').onclick = (e) => {
  const b = e.target.closest('[data-stab]');
  if (!b) return;
  app.shopTab = b.dataset.stab;
  app.refresh();
};
// 전 항목 보기 = 도구 전용. 뽑기 운에 막히지 않고 아무 조합이나 만들어 보라는 스위치다.
$('#shopAll').onchange = (e) => { app.shopAll = e.target.checked; app.refresh(); };
$('#resumeBtn').onclick = () => app.closeShop();
$('#resetAllBtn').onclick = () => { B.resetAll(); app.rebuild(); };
$('#exportBtn').onclick = () => {
  // 브라우저가 파일을 직접 못 내려받는 환경도 있어서, 새 창에 텍스트로 띄우고 클립보드에도 넣는다.
  const text = B.exportJson();
  navigator.clipboard?.writeText(text).catch(() => {});
  const w = open('', '_blank');
  if (w) { w.document.title = 'balance.json'; w.document.body.style.cssText = 'background:#0b0e16;color:#e6ecf7;font:12px/1.5 ui-monospace,monospace;padding:16px;white-space:pre;'; w.document.body.textContent = text; }
};
// ── 떠 있는 창 ─────────────────────────────────────────────────────────────
// 제목줄을 잡아 끌면 옮겨진다. 화면을 가리는 자리를 유저가 직접 피하라는 뜻이다.
function draggable(pop) {
  const head = pop.querySelector('.pophead');
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const r = pop.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    head.setPointerCapture(e.pointerId);
    const move = (ev) => {
      // 창을 화면 밖으로 던져 잃어버리지 않게 가둔다.
      pop.style.left = Math.min(Math.max(0, ev.clientX - dx), innerWidth - r.width) + 'px';
      pop.style.top = Math.min(Math.max(0, ev.clientY - dy), innerHeight - 40) + 'px';
    };
    const up = () => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); };
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', up);
  });
  pop.querySelector('[data-close]').onclick = () => { pop.hidden = true; };
}
for (const id of ['#statPop', '#srcPop']) draggable($(id));

const togglePop = (sel, fill) => () => {
  const pop = $(sel);
  pop.hidden = !pop.hidden;
  if (!pop.hidden) fill?.();
};
$('#statBtn').onclick = togglePop('#statPop', () => app.refresh());
$('#breakdownBtn').onclick = togglePop('#srcPop', () => ui.renderSource($('#srcBody'), app));

const tabs = $('#tabs');
tabs.onclick = (e) => {
  const b = e.target.closest('.tab');
  if (!b) return;
  app.tab = b.dataset.tab;
  syncTabs();
  app.refresh();
};
function syncTabs() {
  for (const b of tabs.querySelectorAll('.tab')) b.classList.toggle('on', b.dataset.tab === app.tab);
}

// ── 루프 ───────────────────────────────────────────────────────────────────
// 주소에 ?start=1 을 붙이면 바로 출격한다. 화면을 반복해서 확인할 때 클릭을 아끼려는 것.
// ?wave=9 를 같이 주면 그 웨이브부터 시작한다.
{
  const q = new URLSearchParams(location.search);
  if (q.has('tab')) { app.tab = q.get('tab'); syncTabs(); app.refresh(); }
  if (q.has('start') || q.has('wave')) {
    app.start();
    const w = +q.get('wave');
    if (w >= 1) app.jumpToWave(w);
    if (q.has('god')) { app.stage.godMode = true; $('#godChk').checked = true; }
    if (q.has('auto')) { app.stage.control = 'auto'; $('#autoChk').checked = true; }
    if (q.has('shop')) app.openShop();
  }
}

let last = performance.now();
function frame(now) {
  const raw = Math.min(0.05, (now - last) / 1000);
  last = now;
  readInput();
  if (!app.paused && app.run && !app.run.shopOpen) {
    // 진행 속도가 빠르면 한 프레임을 여러 번 쪼개 돈다 — 큰 dt 한 방은 충돌 판정을 건너뛴다.
    const total = raw * app.speed;
    const steps = Math.max(1, Math.ceil(total / 0.02));
    for (let i = 0; i < steps; i++) app.run.update(total / steps);
  }
  app.stage.draw();
  drawHud();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

let hudTick = 0;
function drawHud() {
  const r = app.run, a = app.stage.agent;
  const hpF = a.maxHp > 0 ? Math.max(0, a.hp / a.maxHp) : 0;
  $('#hpFill').style.width = (hpF * 100) + '%';
  $('#hpText').textContent = `${Math.ceil(a.hp)} / ${Math.round(a.maxHp)}`;
  if (!r) return;
  $('#hudWave').textContent = `웨이브 ${r.wave.waveNo}`;
  const w = r.wave.cur;
  $('#hudType').textContent = w ? ({ normal: '', elite: '정예', horde: '물량', cmd: '지휘관', boss: '최종보스' })[w.type] || '' : '';
  $('#hudTimer').textContent = ui.mmss(r.timeAlive);
  $('#hudCells').textContent = r.cells;
  $('#hudKills').textContent = r.kills;
  // 실시간 DPS = 최근 3초 동안 적이 **실제로 맞은** 피해 / 그 시간(stage.stepDps).
  const d = app.stage.dps;
  $('#hudDps').textContent = Math.round(d.value).toLocaleString();
  $('#hudDpsPeak').textContent = `최고 ${Math.round(d.peak).toLocaleString()}`;
  const dur = w ? r.wave.waveDur(w) : 1;
  $('#waveFill').style.width = Math.min(100, (r.wave.waveTime / dur) * 100) + '%';
  // 지갑은 상점 밖에서도 자주 바뀐다. 패널 전체를 매 프레임 다시 그리면 비싸니 초당 두 번만.
  if (r.shopOpen && (hudTick = (hudTick + 1) % 30) === 0) $('#shopCells').textContent = r.cells;
}
