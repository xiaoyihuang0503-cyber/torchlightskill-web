export const SPECIES = [
  { id: 'elephant', name: '巨象', icon: '🐘', prey: 'lion' },
  { id: 'lion', name: '狂狮', icon: '🦁', prey: 'wolf' },
  { id: 'wolf', name: '头狼', icon: '🐺', prey: 'rat' },
  { id: 'rat', name: '硕鼠', icon: '🐀', prey: 'elephant' },
];
export const RARITIES = ['普通', '魔法', '稀有', '传奇', '至臻', '绮彩'];
export const TOOLS = [
  { id: 'revenge', name: '复仇者之匣', icon: '▣', text: '吃后 30% 开一间牢房，必出当前囚犯可吃的对象。额外开门不触发其他效果。' },
  { id: 'muzzle', name: '狂兽的剧痛口枷', short: '剧痛口枷', icon: '♜', text: '场上囚犯不超过 3 名时，吃后额外升 2 阶。人数判定时点可校准。' },
  { id: 'saw', name: '锈锯', icon: '╱', text: '吃后 25% 概率额外升 1 阶。' },
  { id: 'keys', name: '遗落的钥匙串', icon: '⚿', text: '开后 80% 概率开两侧牢房。额外开门不触发其他效果。' },
  { id: 'rope', name: '绞首绳', icon: '〰', text: '换后的稀有度排除普通、魔法。' },
  { id: 'fire', name: '火刑柱', icon: '♨', text: '每日目的地选项 −1；低于传奇的囚犯换后，40% 概率调整为传奇。' },
  { id: 'nest', name: '蠕动铁盒：硕鼠', short: '蠕动铁盒', icon: '▧', text: '每日开始标记一间未开牢房为鼠巢。演示采用两轮孵化、稀有硕鼠，可校准。' },
  { id: 'rathead', name: '鼠头串：硕鼠', short: '鼠头串', icon: '◈', text: '硕鼠可吃同阶硕鼠，吃后额外升 1 阶；随后仍可能变号。' },
];
export const GIFTS = [
  { id: 'ring', name: '三首扳指', icon: '♛', text: '随机开最多 3 间牢房，不触发其他效果。' },
  { id: 'horn', name: '斗争铜号', icon: '♬', text: '有可吃目标的囚犯依次随机吃 1 名目标。' },
  { id: 'wine', name: '赤色佳酿', icon: '♧', text: '所有低于传奇的囚犯升 1 阶。' },
  { id: 'brand', name: '原罪烙印', icon: '✧', text: '调整最多 4 名无食物囚犯的代号，使其能找到同阶目标。' },
];
export const DEFAULT_CONFIG = {
  version: 'ss14-prerelease-lab-v0.1', days: 20, rooms: 16,
  rarityWeights: [52, 27, 15, 6, 0, 0], codeWeights: [1, 1, 1, 1],
  destinations: 3, eventsChance: 0.18, initialPrisoners: 6,
  rerollsPerDay: 1, reusableRooms: true, circularNeighbors: true,
  muzzleTiming: 'before', rainbowCountsForMuzzle: false,
  nestDays: 2, nestTier: 2, fireEligibility: 'before',
  executionSameTier: true, wineChangesCode: false,
  triggerOrder: ['muzzle', 'rathead', 'saw', 'revenge'],
  goalTiers: [4],
  combatPower: 55, combatCosts: [2, 4, 8, 16, 32, 65],
};
export const ASSUMPTIONS = [
  ['随机分布', '开门品质权重与四种代号权重是实验参数；没有实测概率。'],
  ['经营限制', '演示每个游戏日换一次；吃不占游戏日；被消耗的牢房可重新打开。均待正式规则核准。'],
  ['触发顺序', '默认口枷按吃前人数，绮彩不计场上；依次处理口枷、鼠头串、锈锯、复仇者之匣。可切换判定。'],
  ['目标与卡池', '仅复刻已确认的至臻目标，完成后选一个刑具；卡池均为已展示条目，不代表完整池。'],
  ['鼠巢与事件', '演示两轮孵化稀有硕鼠；事件出现率、环形邻接、处刑效率同阶筛选均为假设。'],
  ['升阶处理', '普通吃后变号；刑具额外升阶合并结算、不额外变号；佳酿默认不变号。封顶和先后待核准。'],
  ['暴乱与奖励', '按稀有度分三组演算战斗，以成长积分表示结果。战力、难度与积分不代表真实掉落、价格或收益。'],
];

export function validateConfig(config) {
  const c = structuredClone({ ...DEFAULT_CONFIG, ...config });
  for (const [key, min, max] of [['days', 1, 100], ['rooms', 16, 16], ['destinations', 1, 3],
    ['initialPrisoners', 0, 16], ['rerollsPerDay', 0, 20], ['nestDays', 1, 20], ['nestTier', 0, 4]]) {
    if (!Number.isInteger(c[key]) || c[key] < min || c[key] > max) throw new Error(`${key} 参数超出范围`);
  }
  for (const [key, size] of [['rarityWeights', 6], ['codeWeights', 4], ['combatCosts', 6]]) {
    if (!Array.isArray(c[key]) || c[key].length !== size || c[key].some(x => !Number.isFinite(x) || x < 0) || c[key].reduce((a,b) => a+b,0) <= 0) throw new Error(`${key} 必须为有效权重`);
  }
  if (!Number.isFinite(c.eventsChance) || c.eventsChance < 0 || c.eventsChance > 1) throw new Error('事件概率必须在 0 到 1 之间');
  if (!Number.isFinite(c.combatPower) || c.combatPower <= 0 || c.combatPower > 100000) throw new Error('演算战力必须为正数');
  if (!['before','after'].includes(c.muzzleTiming) || !['before','after'].includes(c.fireEligibility)) throw new Error('判定时点无效');
  for (const key of ['reusableRooms','circularNeighbors','rainbowCountsForMuzzle','executionSameTier','wineChangesCode']) if (typeof c[key] !== 'boolean') throw new Error(`${key} 必须为布尔值`);
  if (!Array.isArray(c.goalTiers) || c.goalTiers.length > 10 || c.goalTiers.some(x => !Number.isInteger(x) || x < 0 || x > 5)) throw new Error('目标阶级无效');
  const order = ['muzzle','rathead','saw','revenge'];
  if (!Array.isArray(c.triggerOrder) || c.triggerOrder.length !== 4 || new Set(c.triggerOrder).size !== 4 || c.triggerOrder.some(x => !order.includes(x))) throw new Error('触发顺序无效');
  return c;
}
