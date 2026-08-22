// 밸런스 스토어 — 게임의 balance.json 을 그대로 읽어 라이브 편집한다.
//
// 이 파일이 이 도구의 심장이다. 규칙 셋.
//   1. 원본은 절대 안 고친다. fetch 한 값을 base 에 얼려 두고, 편집은 live 에만 쓴다.
//      게임 파일을 도구가 덮으면 "테스트했더니 게임이 바뀌어 있다"가 되고 그건 사고다.
//   2. 편집분은 언제든 되돌린다(키 단위 / 전체). 바뀐 키는 diff() 가 알려 준다.
//   3. 내보내기는 사람이 눈으로 보고 옮긴다. 자동 반영 경로를 두지 않는다.
//
// 경로 표기는 점 표기 하나로 통일한다: 'spawn.baseHpConst', 'waves.3.count', 'enemies.Elite.hpMul'.
// 배열은 인덱스가 아니라 **식별자**로 잡는다(waves = id, enemies = kind, planets/ships = 인덱스).
// 배열 순서가 바뀌어도 편집분이 엉뚱한 줄에 붙지 않게 하려는 것이다.

const SRC = '/res/Data/balance.json';

let base = null;   // 파일 원본(얼어 있음)
let live = null;   // 편집본
const listeners = new Set();

/** 깊은 복사(구조 그대로). JSON 값만 담기므로 이걸로 충분하다. */
const clone = (o) => JSON.parse(JSON.stringify(o));

export async function load() {
  const res = await fetch(SRC, { cache: 'no-store' });
  if (!res.ok) throw new Error(`balance.json 을 못 읽었다 (${res.status})`);
  const text = (await res.text()).replace(/^﻿/, '');   // Unity 가 BOM 을 붙여 저장한다
  base = Object.freeze(JSON.parse(text));
  live = clone(base);
  emit();
  return live;
}

/** 파일을 직접 먹인다 — 헤드리스 자체검사용(브라우저에서는 load()가 유일한 입구). */
export function loadFrom(text) {
  base = Object.freeze(JSON.parse(text.replace(/^\ufeff/, '')));
  live = clone(base);
  emit();
  return live;
}

export const D = () => live;
export const isLoaded = () => live != null;

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) fn(); }

// ── 경로 해석 ──────────────────────────────────────────────────────────────
// 배열 구간은 식별자로 찾는다. 못 찾으면 숫자 인덱스로 폴백한다.
const KEYED = { waves: 'id', enemies: 'kind', ships: 'name' };

function step(node, key, parentKey) {
  if (Array.isArray(node)) {
    const idKey = KEYED[parentKey];
    if (idKey) {
      const hit = node.find((r) => String(r[idKey]) === key);
      if (hit) return hit;
    }
    return node[Number(key)];
  }
  return node ? node[key] : undefined;
}

function walk(root, path) {
  const parts = path.split('.');
  let node = root, parentKey = null;
  for (let i = 0; i < parts.length - 1; i++) {
    node = step(node, parts[i], parentKey);
    parentKey = Array.isArray(node) ? parts[i] : parts[i];
    if (node == null) return null;
  }
  return { node, key: parts[parts.length - 1], parentKey };
}

export function get(path, root = live) {
  const w = walk(root, path);
  if (!w) return undefined;
  return Array.isArray(w.node) ? step(w.node, w.key, w.parentKey) : w.node[w.key];
}

/** 원본값(리셋·diff 기준). */
export const original = (path) => get(path, base);

export function set(path, value) {
  const w = walk(live, path);
  if (!w || w.node == null) return false;
  if (Array.isArray(w.node)) {
    const idKey = KEYED[w.parentKey];
    if (idKey) {
      const hit = w.node.find((r) => String(r[idKey]) === w.key);
      if (hit) return false;   // 배열 원소 통째 교체는 지원하지 않는다
    }
    w.node[Number(w.key)] = value;
  } else {
    w.node[w.key] = value;
  }
  emit();
  return true;
}

/** 이 키 하나를 원본으로 되돌린다. */
export function reset(path) { return set(path, clone(original(path))); }

/** 전부 되돌린다. */
export function resetAll() { live = clone(base); emit(); }

export const changed = (path) => JSON.stringify(get(path)) !== JSON.stringify(original(path));

// ── 변경 목록 ──────────────────────────────────────────────────────────────
/** 원본과 다른 잎(leaf) 전부를 [{path, from, to}] 로. UI 의 "바뀐 값" 목록이 이걸 그린다. */
export function diff() {
  const out = [];
  const skip = (k) => k === '_note';
  const rec = (a, b, path, parentKey) => {
    if (Array.isArray(b)) {
      const idKey = KEYED[parentKey];
      b.forEach((row, i) => {
        const key = idKey && row && row[idKey] != null ? String(row[idKey]) : String(i);
        const from = idKey && a ? a.find((r) => String(r[idKey]) === key) : (a || [])[i];
        rec(from, row, `${path}.${key}`, parentKey);
      });
      return;
    }
    if (b && typeof b === 'object') {
      for (const k of Object.keys(b)) {
        if (skip(k)) continue;
        rec(a ? a[k] : undefined, b[k], path ? `${path}.${k}` : k, k);
      }
      return;
    }
    if (a !== b) out.push({ path, from: a, to: b });
  };
  rec(base, live, '', null);
  return out;
}

/** 게임에 옮길 수 있는 완전한 JSON 문자열(_note 포함, BOM 없음). */
export function exportJson() {
  return JSON.stringify(live, null, 2) + '\n';
}

// ── 조회 헬퍼 (게임 Balance.D 와 같은 이름) ────────────────────────────────
export const waves = () => live.waves;
export const wave = (id) => live.waves.find((w) => w.id === id);
export const enemy = (kind) => live.enemies.find((e) => e.kind === kind);
export const planet = (i) => live.planets[Math.max(0, Math.min(live.planets.length - 1, i))];
export const ship = (name) => live.ships.find((s) => s.name === name);
