// 게임 밖 성장 비용 — 판을 몇 번 돌아야 다음 한 칸을 올릴 수 있나.
// 이 도구에서 "경제가 맞나"를 재는 유일한 방법이다: 한 판 수입 대비 다음 한 칸의 값.
import * as B from './balance.js';
import { EQ_LEVELS_PER_TIER, RESEARCH } from './defs.js';

/** 장비 강화 1회 코인(EquipCatalog.EnhanceCoinCost). 10단위 반올림, 기본가가 하한이다. */
export function enhanceCoin(tier, level) {
  const e = B.D().economy;
  const P = tier * EQ_LEVELS_PER_TIER + level;
  return Math.max(e.enhanceBase, Math.round((e.enhanceBase * Math.pow(e.enhanceGrowth, P)) / 10) * 10);
}
/** 장비 강화 1회 모듈(EquipCatalog.EnhanceModuleCost). */
export const enhanceModule = (tier, level) => 2 + tier + level;

/** 승급 1회 코인/모듈. 등급이 오를수록 급격히 비싸진다 — 여기가 메타 성장의 병목이다. */
export function promoteCoin(tier) {
  const e = B.D().economy;
  return Math.round((e.promoteBase * Math.pow(e.promoteGrowth, tier)) / 50) * 50;
}
export const promoteModule = (tier) => 10 + tier * 6;

/** 연구 한 칸(ResearchDef.UpgradeCost). 값은 분야가 아니라 **총 투자 레벨**을 따라 오른다. */
export function researchCoin(id, totalLevel) {
  const e = B.D().economy;
  const d = RESEARCH.find((r) => r.id === id);
  const c = e.researchBase * (d ? d.costMul : 1) * Math.pow(e.researchGrowth, totalLevel);
  return Math.max(10, Math.round(c / 10) * 10);
}

/** 요원 레벨 한 칸(growth.shipCoinBase × growth^Lv). */
export function shipLevelCoin(lv) {
  const g = B.D().growth;
  return Math.round((g.shipCoinBase * Math.pow(g.shipCoinGrowth, lv)) / 10) * 10;
}

/** 이 편성을 지금 한 단계 더 올리는 데 드는 코인 목록. 경제 탭이 표로 그린다. */
export function nextSteps(lo) {
  const total = lo.research.reduce((a, b) => a + b, 0);
  const rows = [
    { what: `요원 레벨 ${lo.shipLevel} → ${lo.shipLevel + 1}`, coin: shipLevelCoin(lo.shipLevel),
      capped: lo.shipLevel >= B.D().growth.shipLvMax },
  ];
  for (const slot of ['Weapon', 'Body', 'Core', 'Engine']) {
    const e = lo.equip[slot];
    if (!e || e.id == null) continue;
    if (e.level < EQ_LEVELS_PER_TIER) {
      rows.push({ what: `${slot} 강화 +${e.level} → +${e.level + 1}`, coin: enhanceCoin(e.tier, e.level),
        module: enhanceModule(e.tier, e.level) });
    } else {
      rows.push({ what: `${slot} 승급 ${e.tier} → ${e.tier + 1}`, coin: promoteCoin(e.tier),
        module: promoteModule(e.tier), capped: e.tier >= 4 });
    }
  }
  for (const d of RESEARCH) {
    rows.push({ what: `연구 ${d.name} Lv${lo.research[d.id]} → ${lo.research[d.id] + 1}`,
      coin: researchCoin(d.id, total), capped: lo.research[d.id] >= d.maxLevel });
  }
  return rows;
}
