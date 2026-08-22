// 정비 상점 스킬 탭 매물 16종의 표시 정보.
//
// 매물 목록의 단일 관문은 UpgradeSystem.WeaponSkills 배열이다(여기서 빠지면 상점·상자·광고
// 어디에도 안 뜬다). 이 파일의 순서와 구성은 그 배열을 그대로 따른다.
//
// 각 항목:
//   id      BuildSkills.Skill 열거값 이름
//   icon    Resources 스프라이트명(게임이 카드에 쓰는 바로 그 조각)
//   intro   처음 얻을 때 상점 카드에 뜨는 소개 한 문장(BuildSkills.Describe)
//   how     "실제로 어떻게 도는가" — 발동 조건, 표적 규칙, 피해 성질, 다른 시스템과의 관계
//   rows    레벨별 수치 표. 게임 공식(formulas.js)에서 뽑는다
//   src     원본 코드 위치. 툴에서 본 값이 의심스러우면 여기부터 열면 된다
import { F, WF, PLAN, WPLAN, planGain, MAX_LEVEL, WEAPON_MAX_LEVEL } from './formulas.js';

const s1 = (v) => v.toFixed(1);
const s2 = (v) => v.toFixed(2);
const pct = (v) => Math.round(v * 100) + '%';

export const CAT = {
  ATK: '공격',
  UTIL: '유틸',
  DEF: '방어',
  WEAPON: '무기',
};

export const SKILLS = [
  {
    id: 'Chain', name: '라이트닝 체인', icon: 'lv_lightning', cat: CAT.ATK,
    evo: { name: '뇌우', icon: 'skill_chain_evo', blurb: '낙뢰가 전선을 이루며 동시에 세 곳으로 떨어진다' },
    intro: '가까운 적을 연쇄적으로 공격하는 번개 발생',
    how: [
      '전류는 언제나 요원 본체에서 출발한다. 무작위 낙뢰 지점은 2026-07-31에 폐기됐다.',
      '홉마다 0.05초를 두고 순차로 뻗어서 사슬이 자라는 게 눈에 보인다. 한 번 문 적은 같은 발사 안에서 다시 물지 않는다.',
      '후보는 화면 안의 적으로만 제한한다. 화면 밖으로 사슬이 새면 플레이어가 무슨 일이 일어났는지 못 읽는다.',
      '진화형 뇌우는 갈래가 셋으로 늘고 홉이 하나 더 붙는다. 세 갈래는 표적을 공유해서 같은 적을 겹쳐 물지 않는다.',
    ],
    rows: (l, evo, d) => [
      ['발사 주기', s2(F.chainInterval(l, evo)) + '초'],
      ['연쇄 수', F.chainHops(l, evo) + '체' + (evo ? ' (진화 +1)' : '')],
      ['동시 갈래', F.chainShots(evo) + '갈래'],
      ['홉당 피해', Math.round(F.chainDamage(l, d))],
      ['한 번의 총 피해', Math.round(F.chainDamage(l, d) * F.chainHops(l, evo) * F.chainShots(evo))],
    ],
    src: 'BuildSkills.cs CastChain / ChainInterval',
  },
  {
    id: 'Explode', name: '관통 로켓', icon: 'skill_explode', cat: CAT.ATK,
    evo: { name: '파열 랜스', icon: 'skill_explode_evo', blurb: '관통할 때마다 그 지점에서 파편이 방사된다' },
    intro: '적을 뚫고 지나가는 로켓 발사',
    how: [
      '가장 가까운 적 방향으로 로켓 하나를 쏜다. 사거리 13 안에 적이 없으면 요원이 보는 쪽으로 나간다.',
      '느리게 직진하면서 경로 위의 적을 전부 관통한다. 같은 적은 0.45초에 한 번만 맞는다.',
      '비행 속도 4.2, 수명 3.2초. 폭발이 아니라 관통이라서 줄지어 오는 무리에 한 발이 다 꽂힌다.',
      '진화형 파열 랜스는 관통할 때마다 그 자리에서 파편을 방사한다. 대신 발사 주기가 1.8배 길어진다.',
    ],
    rows: (l, evo, d) => [
      ['발사 주기', s2(F.explodeInterval(l, evo)) + '초'],
      ['관통당 피해', F.explodeDamage(l, d)],
      ['로켓 크기', s2(F.explodeLen(l)) + ' 유닛'],
      ['비행 속도', s1(F.explodeSpeed()) + ' 유닛/초'],
      ['수명', s1(F.explodeLife()) + '초'],
    ],
    src: 'BuildSkills.cs CastExplode / PiercingRocket.cs',
  },
  {
    id: 'Split', name: '분열탄', icon: 'skill_split', cat: CAT.ATK,
    evo: { name: '노바 버스트', icon: 'skill_split_evo', blurb: '파편이 멎은 자리마다 플라즈마 웅덩이' },
    intro: '사방으로 퍼지는 파편 발사',
    how: [
      '요원 중심에서 파편을 균등 각도로 방사한다. 표적을 고르지 않으므로 적이 없어도 발동한다.',
      '파편은 사거리 끝에서 사라진다. 사거리가 짧아서 근접에서 둘러싸였을 때 값이 가장 크다.',
      '파편은 다시 스킬을 유발하지 않는다. 재귀 발동을 막으려고 발사 단계에서 차단한다.',
      '진화형 노바 버스트는 파편 두 발 중 한 발 자리에 플라즈마 웅덩이를 남긴다. 만렙 20발 전부에 깔면 화면이 통째로 피해존이 되어서 하나 건너 하나로 줄였다.',
    ],
    rows: (l, evo, d) => [
      ['발사 주기', s2(F.splitInterval(l, evo)) + '초'],
      ['파편 수', F.splitFrags(l) + '발'],
      ['파편 사거리', s2(F.splitRange(l)) + ' 유닛'],
      ['파편당 피해', Math.round(F.splitDamage(l, d))],
      ['웅덩이', evo ? Math.floor(F.splitFrags(l) / 2) + '개, ' + s1(F.poolLife()) + '초 지속' : '없음'],
    ],
    src: 'BuildSkills.cs CastSplit / PlasmaPool',
  },
  {
    id: 'FireField', name: '플라즈마 필드', icon: 'skill_firefield', cat: CAT.ATK,
    evo: { name: '인페르노', icon: 'skill_firefield_evo', blurb: '장판이 훨씬 넓고 오래 유지된다' },
    intro: '주변 적을 지속 공격하는 플라즈마 필드 형성',
    how: [
      '상시 전개가 아니다. 전개와 재충전을 번갈아 돈다. 전개 중에만 피해가 들어간다.',
      '0.25초마다 반경 안 전원을 때린다. 넉백은 0.1배로 눌러 둔다. 장판이 적을 밀어내면 장판의 의미가 없다.',
      '표시 원의 지름이 곧 피해 지름이다. 속은 거의 투명하고 경계 링만 또렷하게 그려서 바닥과 적을 안 가린다.',
      '진화형 인페르노는 범위와 피해와 전개 시간이 오르지만 재충전은 오히려 1.5배로 늘어난다. 진화라도 재사용 대기시간은 있어야 한다는 규칙이다.',
    ],
    rows: (l, evo, d) => [
      ['전개', s2(F.fireDuration(l, evo)) + '초'],
      ['재충전', s2(F.fireRest(l, evo)) + '초'],
      ['반경', s2(F.fireRadius(l, evo)) + ' 유닛'],
      ['초당 피해', Math.round(F.fireDps(l, evo)) + ' (요원 공격력 무관)'],
      ['가동률', pct(F.fireDuration(l, evo) / (F.fireDuration(l, evo) + F.fireRest(l, evo)))],
    ],
    src: 'BuildSkillAuras.cs FireFieldSkill',
  },
  {
    id: 'FrostAura', name: '빙결 레이저', icon: 'skill_frost', cat: CAT.UTIL,
    evo: { name: '절대영도', icon: 'skill_frost_evo', blurb: '얼어붙은 적이 인접한 적까지 얼린다' },
    intro: '냉기를 뿜는 레이저로 적을 일시적으로 얼림',
    how: [
      '가장 가까운 적 쪽으로 직선 빔을 쏜다. 사거리 안에 적이 없으면 요원이 보는 쪽으로 나간다.',
      '빔 폭 안에 든 적은 전부 완전 정지한다. 감속이 아니라 이동 배수 0이다. 이 게임에서 유일한 하드 CC다.',
      '피해도 들어가지만 딜링기가 아니다. 정지 시간을 늘린 대가로 피해를 3분의 1로 깎아 뒀다.',
      '진화형 절대영도는 얼어붙은 적이 전도체가 되어 반경 2.2 안 이웃까지 언다. 한 홉만 번진다. 무리 전체가 굳으면 게임이 멈춘다.',
    ],
    rows: (l, evo, d) => [
      ['발사 주기', s2(F.frostCooldown(l, evo)) + '초'],
      ['빙결 시간', s2(F.frostFreeze(l, evo)) + '초'],
      ['빔 폭', s2(F.frostWidth(l, evo)) + ' 유닛'],
      ['사거리', s1(F.frostRange(l)) + ' 유닛'],
      ['전염', evo ? '반경 ' + s1(F.frostSpread()) + ' 1홉' : '없음'],
    ],
    src: 'BuildSkillAuras.cs FrostLaserSkill',
  },
  {
    id: 'Orbital', name: '궤도 위성포', icon: 'skill_orbital', cat: CAT.ATK,
    intro: '공중 궤도 위성에서 레이저를 통한 광역 공격',
    how: [
      '표적은 밀집 지점이다. 화면 안 적 중 반경 2.2 안에 이웃이 가장 많은 개체를 고르고 동률이면 가까운 쪽을 고른다.',
      '0.85초 조준 신호가 먼저 뜬다. 링이 실제 소탕 반폭까지 좁혀 들어오고 틱 넷이 돌고 조준 박스가 12헤르츠로 점멸한다.',
      '기둥이 떨어지면 그 폭 안은 체력과 종류를 가리지 않고 전멸한다. 피해 경쟁이 아니라 저 구역을 지운다가 정체성이다.',
      '보스와 균열만 면역이라 표에 적힌 피해값만 받는다. 즉사가 통하면 보스전이 쿨 기다리기가 되고 균열은 목표 스킵이 된다.',
    ],
    rows: (l, evo, d) => [
      ['발사 주기', s2(F.orbitalInterval(l)) + '초'],
      ['소탕 반폭', s2(F.orbitalWidth(l)) + ' 유닛'],
      ['소탕 판정', '기둥 안 전멸'],
      ['보스 피해', F.orbitalDamage(l, d)],
      ['조준 시간', s2(F.orbitalTelegraph()) + '초'],
    ],
    src: 'BuildSkillAuras.cs OrbitalStrikeSkill / BuildSkills.WipeColumn',
  },
  {
    id: 'Mine', name: '광역 살포 지뢰', icon: 'skill_mine', cat: CAT.ATK,
    intro: '주변에 지뢰를 다량 살포하여 다가오는 적 공격',
    how: [
      '발밑이 아니라 투척 거리 안 무작위 지점에 던진다. 발밑에 깔면 이미 지나간 자리를 막는 셈이 된다.',
      '설치 후 0.5초는 무장 지연이다. 깔자마자 밟히는 억울함을 막는다.',
      '반경 0.6 안에 적이 들어오면 즉시 터진다. 종류를 가리지 않는다.',
      '동시 유지 수가 차 있으면 주기는 소모하되 설치는 건너뛴다. 설치 스팸을 막는 규칙이다.',
    ],
    rows: (l, evo, d) => [
      ['살포 주기', s2(F.mineInterval(l)) + '초'],
      ['동시 유지', F.mineMax(l) + '개'],
      ['투척 거리', s2(F.mineThrow(l)) + ' 유닛'],
      ['폭발 반경', s2(F.mineRadius(l)) + ' 유닛'],
      ['폭발 피해', F.mineDamage(l, d)],
    ],
    src: 'BuildSkillAuras.cs MineLayerSkill / SkillMine',
  },
  {
    id: 'MineBreak', name: '장갑 지뢰', icon: 'skill_minebreak', cat: CAT.ATK,
    intro: '강력한 적에게 위력을 발휘하는 대형 지뢰 소량 살포',
    how: [
      '한 번에 하나만 존재한다. 큰 것 하나가 정체성이라서 동시 유지 수를 늘리지 않는다.',
      '대형 적이 폭발 반경 안에 들어오면 그 자리에서 즉시 터진다. 감지 반경과 폭발 반경을 같게 둬서 터졌는데 밖에 있어 피해가 0인 구멍이 없다.',
      '소형 적이 밟으면 터지지 않고 5초 신관만 점화된다. 5초 뒤면 그 적은 대개 자리를 떠나 있다. 이 비효율이 잡몹에는 쓰지 않는다는 성격을 만든다.',
      '터질 때 0.05초 히트스톱이 걸린다. 광역 지뢰에는 없는 무게감이다.',
    ],
    rows: (l, evo, d) => [
      ['살포 주기', s2(F.breakInterval(l)) + '초'],
      ['동시 유지', F.breakMax() + '개'],
      ['폭발 반경', s2(F.breakRadius(l)) + ' 유닛'],
      ['폭발 피해', F.breakDamage(l, d)],
      ['소형 신관', s1(F.breakFuse()) + '초'],
    ],
    src: 'BuildSkillAuras.cs MineBreakLayerSkill / SkillMine',
  },
  {
    id: 'Gravity', name: '중력장 우물', icon: 'skill_gravity', cat: CAT.UTIL,
    intro: '중력장을 발생시켜 적을 끌어모음',
    how: [
      '밀집 지점에 소용돌이를 연다. 반경 안 적을 중심으로 당기면서 접선 방향으로도 돌린다.',
      '흡인력은 중심에 가까울수록 세다. 반경 밖에서는 아무 영향이 없다.',
      '0.3초마다 들어가는 틱 피해는 비살상이다. 어떤 적도 체력 1 아래로는 안 내려간다. 딜은 양념이고 모아주는 것이 본체다.',
      '지속이 끝나면 반경 0.75배 안에서 폭축이 터진다. 이것도 비살상이다. 모아둔 무리를 다른 광역기로 지우라는 설계다.',
    ],
    rows: (l, evo, d) => [
      ['발동 주기', s2(F.gravityInterval(l)) + '초'],
      ['지속', s2(F.gravityDuration(l)) + '초'],
      ['반경', s2(F.gravityRadius(l)) + ' 유닛'],
      ['초당 피해', Math.round(F.gravityDps(l, d) * 10) / 10 + ' (비살상)'],
      ['폭축 피해', F.gravityBurst(l, d) + ' (비살상)'],
    ],
    src: 'BuildSkillAuras.cs GravityWellSkill / GravityWellObj',
  },
  {
    id: 'Pulse', name: '충격 펄스', icon: 'skill_pulse', cat: CAT.UTIL,
    intro: '충격파를 발생시켜 다가오는 적과 투사체를 튕겨냄',
    how: [
      '요원 중심에서 파동이 퍼진다. 표적을 고르지 않으므로 적이 없어도 주기마다 돈다.',
      '반경 안 적을 4.2배 넉백으로 밀어낸다. 피해는 비살상이라 이 스킬만으로는 아무도 못 죽인다.',
      '같은 반경 안의 적 탄환을 전부 지운다. 탄막에 갇혔을 때 이 한 줄이 값의 절반이다.',
      '밀치기와 탄 소거가 본체라서 가격표에서도 가장 싼 축에 있다.',
    ],
    rows: (l, evo, d) => [
      ['발동 주기', s2(F.pulseInterval(l)) + '초'],
      ['반경', s2(F.pulseRadius(l)) + ' 유닛'],
      ['피해', F.pulseDamage(l, d) + ' (비살상)'],
      ['넉백', '4.2배'],
      ['탄 소거', '반경 내 전부'],
    ],
    src: 'BuildSkillAuras.cs ShockPulseSkill / PulseRingFx',
  },
  {
    id: 'Timeslow', name: '시간 지연 펄스', icon: 'skill_timeslow', cat: CAT.UTIL,
    intro: '시간을 왜곡하여 일시적으로 주변 적의 동작을 느리게 함',
    how: [
      '화면 안 모든 적에게 한꺼번에 걸린다. 반경 개념이 없는 유일한 제어기다.',
      '감속이지 정지가 아니다. 빙결 레이저의 완전 정지와 축을 나누려고 일부러 움직임을 남겼다.',
      '전역에 걸리는 대신 지속이 짧고 자체 킬이 0이다. 그래서 값도 기준선 아래다.',
      '적이 화면에 하나도 없으면 주기를 소모하지 않고 0.5초 뒤 다시 시도한다.',
    ],
    rows: (l, evo, d) => [
      ['발동 주기', s2(F.timeslowInterval(l)) + '초'],
      ['지속', s2(F.timeslowDuration(l)) + '초'],
      ['이동 배수', s2(F.timeslowFactor(l)) + '배'],
      ['체감 감속', pct(1 - F.timeslowFactor(l))],
      ['범위', '화면 전체'],
    ],
    src: 'BuildSkillAuras.cs TimeDilationSkill / TimeFieldFx',
  },
  {
    id: 'ReflectBall', name: '리플랙션볼', icon: 'skill_reflectball', cat: CAT.ATK,
    intro: '자기장 벽에 튕기며 화면을 가로지르는 이온 구체 사출',
    how: [
      '가까운 적 쪽으로 사출한다. 이후로는 요원과 아무 상호작용이 없다. 경로가 요원 위를 지나가도 통과한다.',
      '반사는 보이는 화면 가장자리에서만 일어난다. 자기장 경계로 잡았더니 화면 밖이라 계속 벗어났다.',
      '적을 통과하면서 접촉 피해를 준다. 같은 적은 0.35초에 한 번만 맞는다. 스치는 동안 프레임마다 폭딜이 들어가는 것을 막는다.',
      '동시 유지 수가 차 있으면 주기는 소모하되 사출은 건너뛴다.',
    ],
    rows: (l, evo, d) => [
      ['사출 주기', s2(F.reflectBallInterval(l)) + '초'],
      ['동시 유지', F.reflectBallMax(l) + '개'],
      ['수명', s2(F.reflectBallLife(l)) + '초'],
      ['접촉 피해', Math.round(F.reflectBallDamage(l, d)) + ' / ' + s2(F.reflectBallTick()) + '초'],
      ['이동 속도', s1(F.reflectBallSpeed()) + ' 유닛/초'],
    ],
    src: 'BuildSkillAuras.cs ReflectBallSkill / ReflectBall',
  },
  {
    id: 'IonGrenade', name: '이온 수류탄', icon: 'skill_iongrenade', cat: CAT.ATK,
    intro: '적이 몰린 곳에 던져 지지고 늦추는 이온 웅덩이 생성',
    how: [
      '밀집 지점으로 0.75초 동안 날아간다. 탑다운이라 높이 대신 스케일이 부푸는 방식으로 체공을 표현한다.',
      '착탄하면 섬광이 한 번 터지고 웅덩이가 열린다. 전개 순간 0.12초 동안 2.2배에서 1배로 조여드는 슬램 과충격이 있다.',
      '0.25초마다 지속 피해와 감속을 같이 건다. 감속은 웅덩이를 벗어나면 곧 풀린다.',
      '플라즈마 필드는 발밑이고 이쪽은 길목이다. 축이 겹치지 않도록 표적 규칙 자체를 다르게 뒀다.',
    ],
    rows: (l, evo, d) => [
      ['투척 주기', s2(F.ionInterval(l)) + '초'],
      ['웅덩이 반경', s2(F.ionRadius(l)) + ' 유닛'],
      ['웅덩이 지속', s2(F.ionLife(l)) + '초'],
      ['초당 피해', Math.round(F.ionDps(l, d))],
      ['감속', pct(1 - F.ionSlow(l))],
    ],
    src: 'BuildSkillAuras.cs IonGrenadeSkill / IonPoolZone',
  },
  {
    id: 'CloneDroid', name: '복제 안드로이드', icon: 'skill_clone', cat: CAT.ATK,
    intro: '나를 따라 걸으며 함께 사격하는 홀로그램 복제 소환',
    how: [
      '요원의 이동 궤적을 기록해 두고 복제가 0.7초 전 자리를 그대로 따라 걷는다. 복제가 둘이면 일렬 종대가 된다.',
      '주무기를 같은 표적에 동조 사격한다. 화력은 요원의 일정 비율이다.',
      '전 스킬 중 재사용 대기시간이 가장 길다. 그만큼 한 번 떴을 때의 값이 크다.',
      '복제는 피격 판정이 없다. 적을 막아 주지는 않는다.',
    ],
    rows: (l, evo, d) => [
      ['소환 주기', s1(F.cloneInterval(l)) + '초'],
      ['유지 시간', s2(F.cloneDuration(l)) + '초'],
      ['동시 소환', F.cloneMax(l) + '기'],
      ['화력 비율', pct(F.cloneRatio(l))],
      ['추종 지연', s1(F.cloneFollowDelay()) + '초'],
    ],
    src: 'BuildSkillAuras.cs CloneDroidSkill / CloneDroid',
  },
  {
    id: 'Sentry', name: '자동 조준 포탑', icon: 'skill_sentry', cat: CAT.ATK,
    intro: '적을 스스로 조준해 쏘는 포탑 설치, 수명이 다하면 폭발',
    how: [
      '요원 주변 1.2에서 2.4 사이에 위에서 떨어진다. 착지 슬램은 사격 피해의 5배로 반경 1.8을 때린다.',
      '착지 뒤에는 사거리 안 가장 가까운 적을 스스로 조준해 쏜다. 요원이 멀어져도 자리에 남는다.',
      '지뢰가 수동 함정이라면 포탑은 능동 화력이다. 둘의 축을 갈라 두려고 설치물 계열을 나눴다.',
      '수명이 다하면 축소되는 게 아니라 과부하로 폭발하며 장갑 파편을 흩뿌린다.',
    ],
    rows: (l, evo, d) => [
      ['설치 주기', s2(F.sentryInterval(l)) + '초'],
      ['동시 설치', F.sentryMax(l) + '기'],
      ['수명', s2(F.sentryLife(l)) + '초'],
      ['사격 간격', s2(F.sentryFireInterval(l)) + '초'],
      ['탄당 피해', Math.round(F.sentryDamage(l, d))],
      ['사거리', s2(F.sentryRange(l)) + ' 유닛'],
    ],
    src: 'BuildSkillAuras.cs SentrySkill / SentryTurret',
  },
  {
    id: 'Repair', name: '야전 수복 장치', icon: 'sup_repair_big', cat: CAT.DEF,
    intro: '웨이브가 끝날 때마다 체력을 소량 회복',
    how: [
      '전투 중 발동이 없는 유일한 액티브다. 웨이브가 끝나는 순간에만 돈다.',
      '정비 상점이 열리기 전에 먼저 들어간다. 상점이 안 열리는 마지막 웨이브 뒤에도 들어간다. 회복은 상점이 아니라 웨이브에 걸린 약속이다.',
      '이미 만피면 연출도 안 뜬다. 0 회복에 연출이 뜨면 그게 거짓말이다.',
      '킬 기여가 0인 대신 회복 시점이 확정이라 이번 웨이브를 얼마나 깎여도 되는지의 기준선을 올린다.',
    ],
    rows: (l, evo, d) => [
      ['발동 시점', '웨이브 종료마다'],
      ['회복량', pct(F.repairPercent(l)) + ' (최대 체력)'],
      ['연출 길이', '1.45초'],
      ['전투 중 발동', '없음'],
    ],
    src: 'BuildSkills.cs OnWaveEnd / FieldRepairFx.cs',
  },
];


// ── 드래프트 무기 7종 ─────────────────────────────────────────────────────
// 액티브 스킬과 같은 무기 칸을 먹지만 WeaponBase 파생이라 만렙이 8이고 성장 축 표도 따로다.
export const WEAPONS = [
  {
    id: 'BombWeapon', name: '강화 로켓', icon: 'lv_heavy_rocket', cat: CAT.WEAPON, max: 8, weapon: true,
    evo: { name: '강화 로켓 융단', icon: 'lv_heavy_rocket_evo', blurb: '한 번에 두 발을 동시에 투하한다' },
    intro: '광역으로 폭발하는 강력한 로켓을 발사',
    how: [
      '가장 가까운 적을 향해 로켓을 쏘아 올린다. 착탄 지점에서 반경 안 전원이 폭발 피해를 받는다.',
      '전 무기 중 주기가 가장 길고 한 발의 무게가 가장 크다. 뭉친 무리 하나를 통째로 지우는 쪽에 값이 있다.',
      '고폭탄두 부속이 붙으면 폭발 피해와 범위가 같이 오른다.',
      '진화형 융단은 두 발을 동시에 던지고 주기도 조금 빨라진다. 대신 폭발 반경은 살짝 줄어든다.',
    ],
    rows: (l, evo, d) => [
      ['투하 주기', WF.bombInterval(l, evo).toFixed(2) + '초'],
      ['동시 투하', WF.bombCount(evo) + '발'],
      ['폭발 반경', WF.bombRadius(l, evo).toFixed(2) + ' 유닛'],
      ['폭발 피해', WF.bombDamage(l, evo, d)],
    ],
    src: 'BombWeapon.cs / HeavyRocket',
  },
  {
    id: 'HomingWeapon', name: '유도 미사일', icon: 'icon_homing', cat: CAT.WEAPON, max: 8, weapon: true,
    evo: { name: '미사일 폭풍', icon: 'icon_homing_evo', blurb: '한 발 더 쏘고 명중 지점마다 연쇄 폭발' },
    intro: '적을 추적하는 미사일 주기적으로 발사',
    how: [
      '표적을 스스로 찾아가므로 조준 부담이 0이다. 사방에 흩어진 적을 훑을 때 값이 크다.',
      '레벨은 발사 수와 주기 둘로만 오른다. 한 발의 피해는 요원 공격력을 따라간다.',
      '투사체 축이 세 번 오르면 명중 시 20% 확률 연쇄 폭발이 붙는다.',
      '진화형 폭풍은 발사 수가 하나 늘고 연쇄가 18%로 고정되며 전용 폭발 연출로 바뀐다.',
    ],
    rows: (l, evo, d) => [
      ['발사 주기', WF.homingInterval(l, evo).toFixed(2) + '초'],
      ['동시 발사', WF.homingShots(l, evo) + '발'],
      ['발당 피해', WF.homingDamage(l, evo, d)],
      ['연쇄 폭발', WF.homingChain(l, evo) ? Math.round(WF.homingChain(l, evo) * 100) + '%' : '없음'],
    ],
    src: 'HomingWeapon.cs / HomingMissile',
  },
  {
    id: 'OrbitalWeapon', name: '궤도 칼날', icon: 'lv_blade_ring', cat: CAT.WEAPON, max: 8, weapon: true,
    evo: { name: '칼날 폭풍', icon: 'lv_blade_ring_evo', blurb: '칼날이 일곱 개로 늘고 재소환이 빨라진다' },
    intro: '주위를 돌며 적을 공격하는 칼날 생성',
    how: [
      '칼날이 소환돼 요원 주위를 딱 한 바퀴 돌고 사라진다. 상시로 떠 있는 게 아니라 한 바퀴가 한 번의 발동이다.',
      '같은 적은 0.4초에 한 번만 맞는다. 붙어 있는 동안 계속 갈리는 게 아니라 일정 간격으로 들어간다.',
      '한 바퀴가 끝나면 재소환 주기만큼 쉰다. 그래서 쿨타임은 다음 소환까지의 대기를 뜻한다.',
      '근접을 막아 주는 역할까지 겸해서 접근형 적이 많은 구간에서 값이 오른다.',
    ],
    rows: (l, evo, d) => [
      ['칼날 수', WF.bladeCount(l, evo) + '개'],
      ['재소환', WF.bladeRest(l, evo).toFixed(2) + '초'],
      ['궤도 반경', WF.bladeRadius(l, evo).toFixed(2) + ' 유닛'],
      ['접촉 피해', WF.bladeDamage(l, evo, d)],
      ['재타격 간격', '0.40초'],
    ],
    src: 'OrbitalWeapon.cs',
  },
  {
    id: 'DroneWeapon', name: '공격형 드론 알파', icon: 'lv_drone_atk', cat: CAT.WEAPON, max: 8, weapon: true,
    evo: { name: '드론 군단', icon: 'lv_drone_atk_evo', blurb: '드론 수와 화력이 함께 오른다' },
    intro: '주위를 돌며 적을 공격하는 드론 생성',
    how: [
      '드론이 요원 주위를 돌면서 사거리 안 적을 스스로 쏜다. 최대 세 기까지다.',
      '전개와 대기를 번갈아 돈다. 대기 중에는 사격이 멈추므로 순간 화력이 낮은 대신 손이 안 간다.',
      '쿨링 시스템 부속이 붙으면 드론 사격 간격도 같이 줄어든다.',
      '진화형 군단은 드론 수 상한까지 채우고 발당 피해가 오른다.',
    ],
    rows: (l, evo, d) => [
      ['드론 수', WF.droneCount(l, evo) + '기'],
      ['사격 간격', WF.droneFireInterval(l, evo).toFixed(2) + '초'],
      ['전개', WF.droneDeploy(l).toFixed(2) + '초'],
      ['대기', WF.droneRest(l).toFixed(2) + '초'],
      ['사거리', WF.droneRange(l).toFixed(2) + ' 유닛'],
      ['발당 피해', WF.droneDamage(l, evo, d)],
    ],
    src: 'DroneWeapon.cs',
  },
  {
    id: 'BoomerangWeapon', name: '네온 부메랑', icon: 'lv_boomerang', cat: CAT.WEAPON, max: 8, weapon: true,
    evo: { name: '트윈 사이클론', icon: 'lv_boomerang_evo', blurb: '한 개 더 던지고 사거리가 늘어난다' },
    intro: '던지고 되돌아오며 적을 공격하는 부메랑',
    how: [
      '조준 방향으로 던지면 사거리 끝에서 되돌아온다. 왕복 경로라 맞히는 각이 필요하다.',
      '같은 적은 0.35초에 한 번만 맞는다. 가는 길과 오는 길에 각각 한 번씩 들어가는 셈이다.',
      '사거리 성장은 일부러 뒤로 미뤄 뒀다. 저레벨에서 너무 멀리 날면 화면 밖에서 헛돈다.',
      '진화형 사이클론은 던지는 개수가 늘고 회수 지점에 회오리 연출이 붙는다.',
    ],
    rows: (l, evo, d) => [
      ['투척 주기', WF.boomInterval(l).toFixed(2) + '초'],
      ['동시 투척', WF.boomCount(l, evo) + '개'],
      ['사거리', WF.boomRange(l, evo).toFixed(2) + ' 유닛'],
      ['타격 피해', WF.boomDamage(l, evo, d)],
      ['재타격 간격', '0.35초'],
    ],
    src: 'BoomerangWeapon.cs',
  },
  {
    id: 'SupportDroneWeapon', name: '지원형 드론 델타', icon: 'lv_drone_support', cat: CAT.WEAPON, max: 8, weapon: true,
    evo: { name: '지원 드론 군단', icon: 'lv_drone_support_evo', blurb: '회복 주기가 짧아지고 보급 링 연출이 붙는다' },
    intro: '주위를 돌며 주기적으로 부상을 치유',
    how: [
      '요원 주위를 도는 드론이 주기마다 최대 체력의 일부를 되돌린다. 킬 기여는 0이다.',
      '표적을 고르지 않으므로 적이 없어도 계속 돈다. 회복 시점이 확정이라 생존의 바닥을 올린다.',
      '야전 수복 장치가 웨이브 단위라면 이쪽은 전투 중 상시다. 축이 겹치지 않는다.',
      '가격표에서도 킬 기여 0을 반영해 기준선 아래에 있다.',
    ],
    rows: (l, evo, d) => [
      ['회복 주기', WF.supInterval(l).toFixed(2) + '초'],
      ['회복량', Math.round(WF.supHeal(l) * 100) + '% (최대 체력)'],
      ['궤도 반경', '1.70 유닛'],
      ['킬 기여', '없음'],
    ],
    src: 'SupportDroneWeapon.cs',
  },
  {
    id: 'CoreShieldSkill', name: '코어 쉴드', icon: 'lv_core_shield', cat: CAT.WEAPON, max: 8, weapon: true,
    evo: { name: '코어 쉴드 오메가', icon: 'lv_core_shield', blurb: '보호막이 더 오래 유지된다' },
    intro: '일정시간 적으로부터 보호되는 보호막 생성',
    how: [
      '주기마다 보호막이 켜지고 지속 시간 동안 피해를 한 번 막는다. 한 대 맞으면 그 자리에서 깨진다.',
      '그래서 실효 가치는 몇 초 켜져 있느냐가 아니라 몇 초마다 한 대를 막아 주느냐다. 성장도 주기 쪽을 더 건드렸다.',
      '주기 하한 4.2에 공통 배수를 먹여도 만렙 지속보다 위다. 하한이 지속 밑으로 내려가면 그 순간 상시 무적이 된다.',
      '깨질 때 반사 임팩트가 뜬다. 막았다는 사실이 화면에 남아야 다음 판단이 선다.',
    ],
    rows: (l, evo, d) => [
      ['발동 주기', WF.shieldPeriod(l).toFixed(2) + '초'],
      ['지속', WF.shieldDuration(l).toFixed(2) + '초'],
      ['막는 횟수', '전개당 1회'],
      ['가동률', Math.round((WF.shieldDuration(l) / WF.shieldPeriod(l)) * 100) + '%'],
    ],
    src: 'CoreShieldSkill.cs',
  },
];

/** 목록 전체. 액티브 스킬 16종 다음에 드래프트 무기 7종. */
export const ALL = SKILLS.concat(WEAPONS);
export const maxLevelOf = (s) => s.max || MAX_LEVEL;

/** 이 레벨에서 오른 축의 한 줄 문구. Lv1 은 소개 문장을 쓴다(상점 카드와 같은 규칙). */
export function levelLine(skill, level) {
  const p = PLAN[skill.id] || WPLAN[skill.id];
  if (!p || level <= 1) return skill.intro;
  return planGain(p.ax, p.pl, level);
}

/** 만렙까지 어느 레벨에 어떤 축이 오르는지. 성장 계획표에 그린다. */
export function levelPlanRows(skill) {
  const p = PLAN[skill.id] || WPLAN[skill.id];
  const out = [{ level: 1, gain: skill.intro, axis: -1 }];
  for (let l = 2; l <= maxLevelOf(skill); l++) out.push({ level: l, gain: planGain(p.ax, p.pl, l), axis: p.pl[l - 2] });
  return out;
}

/** 성장 축 이름표. 스킬과 무기가 서로 다른 표를 쓴다. */
export const axesOf = (skill) => (PLAN[skill.id] || WPLAN[skill.id]).ax;

export const byId = (id) => ALL.find((s) => s.id === id);
