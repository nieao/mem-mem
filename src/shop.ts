/**
 * 🦞 龙虾小镇商店系统
 * 装饰商店 + 龙虾宠物商店 + 玩家房间 + 委托系统
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// ══════════════════════════════════════
// 装饰品 / 家具商品
// ══════════════════════════════════════

export interface ShopItem {
  id: string;
  name: string;
  category: 'furniture' | 'wall-art' | 'floor' | 'lighting' | 'plant' | 'tech' | 'luxury';
  price: number;
  icon: string;
  description: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  // 在房间中的渲染参数
  render: {
    type: 'rect' | 'circle' | 'custom';
    color: string;
    width: number;
    height: number;
    slot: 'floor' | 'wall' | 'desk' | 'ceiling';  // 放置位置
  };
}

export const SHOP_ITEMS: ShopItem[] = [
  // ── 普通家具 ──
  { id: 'sofa-basic', name: '基础沙发', category: 'furniture', price: 200, icon: '🛋️',
    description: '舒适的双人沙发，适合看电视', rarity: 'common',
    render: { type: 'rect', color: '#8b7b6b', width: 80, height: 35, slot: 'floor' } },
  { id: 'desk-wood', name: '木质书桌', category: 'furniture', price: 300, icon: '🪑',
    description: '实木工作桌，配有抽屉', rarity: 'common',
    render: { type: 'rect', color: '#6b5b4b', width: 90, height: 30, slot: 'floor' } },
  { id: 'bookshelf', name: '书架', category: 'furniture', price: 250, icon: '📚',
    description: '四层书架，可放书和摆件', rarity: 'common',
    render: { type: 'rect', color: '#7b6555', width: 50, height: 100, slot: 'wall' } },
  { id: 'coffee-table', name: '茶几', category: 'furniture', price: 150, icon: '☕',
    description: '小巧的圆形茶几', rarity: 'common',
    render: { type: 'circle', color: '#8b7b6b', width: 40, height: 20, slot: 'floor' } },

  // ── 墙面装饰 ──
  { id: 'painting-abstract', name: '抽象画', category: 'wall-art', price: 400, icon: '🖼️',
    description: '现代风格抽象画，暖色调', rarity: 'rare',
    render: { type: 'rect', color: '#c8a882', width: 60, height: 45, slot: 'wall' } },
  { id: 'painting-lobster', name: '龙虾名画', category: 'wall-art', price: 800, icon: '🦞',
    description: '限量版龙虾主题油画，艺术家手绘', rarity: 'epic',
    render: { type: 'rect', color: '#e05040', width: 70, height: 50, slot: 'wall' } },
  { id: 'mirror-gold', name: '金框镜子', category: 'wall-art', price: 350, icon: '🪞',
    description: '复古金色边框全身镜', rarity: 'rare',
    render: { type: 'rect', color: '#d4c090', width: 30, height: 60, slot: 'wall' } },
  { id: 'clock-vintage', name: '复古挂钟', category: 'wall-art', price: 200, icon: '🕰️',
    description: '齿轮可见的蒸汽朋克挂钟', rarity: 'common',
    render: { type: 'circle', color: '#888', width: 40, height: 40, slot: 'wall' } },

  // ── 地面装饰 ──
  { id: 'rug-persian', name: '波斯地毯', category: 'floor', price: 500, icon: '🟫',
    description: '手工编织波斯风格地毯', rarity: 'rare',
    render: { type: 'rect', color: '#a06040', width: 120, height: 40, slot: 'floor' } },
  { id: 'rug-modern', name: '极简地毯', category: 'floor', price: 300, icon: '⬜',
    description: '纯色几何图案现代地毯', rarity: 'common',
    render: { type: 'rect', color: '#c0b8a8', width: 100, height: 35, slot: 'floor' } },

  // ── 灯具 ──
  { id: 'lamp-floor', name: '落地灯', category: 'lighting', price: 280, icon: '💡',
    description: '北欧风弯颈落地灯，暖光', rarity: 'common',
    render: { type: 'rect', color: '#c8a882', width: 15, height: 80, slot: 'floor' } },
  { id: 'chandelier', name: '水晶吊灯', category: 'lighting', price: 1500, icon: '✨',
    description: '施华洛世奇水晶吊灯，奢华', rarity: 'legendary',
    render: { type: 'circle', color: '#f0e8d0', width: 60, height: 30, slot: 'ceiling' } },
  { id: 'neon-lobster', name: '龙虾霓虹灯', category: 'lighting', price: 600, icon: '🦞',
    description: '龙虾形状的LED霓虹灯管', rarity: 'epic',
    render: { type: 'custom', color: '#ff5050', width: 50, height: 30, slot: 'wall' } },

  // ── 植物 ──
  { id: 'plant-monstera', name: '龟背竹', category: 'plant', price: 180, icon: '🌿',
    description: '大叶龟背竹，净化空气', rarity: 'common',
    render: { type: 'rect', color: '#5a8b4a', width: 30, height: 60, slot: 'floor' } },
  { id: 'bonsai', name: '盆景松', category: 'plant', price: 450, icon: '🌳',
    description: '百年造型松盆景', rarity: 'rare',
    render: { type: 'rect', color: '#4a7a3a', width: 25, height: 35, slot: 'desk' } },

  // ── 科技 ──
  { id: 'monitor-4k', name: '4K 显示器', category: 'tech', price: 800, icon: '🖥️',
    description: '32寸4K显示器，设计师必备', rarity: 'rare',
    render: { type: 'rect', color: '#2a2a2a', width: 70, height: 45, slot: 'desk' } },
  { id: 'smart-speaker', name: '智能音箱', category: 'tech', price: 350, icon: '🔊',
    description: '支持语音控制龙虾屋所有设备', rarity: 'common',
    render: { type: 'circle', color: '#333', width: 20, height: 20, slot: 'desk' } },
  { id: 'robot-vacuum', name: '扫地机器人', category: 'tech', price: 500, icon: '🤖',
    description: '自动清洁龙虾屋，龙虾也能骑', rarity: 'rare',
    render: { type: 'circle', color: '#555', width: 25, height: 10, slot: 'floor' } },

  // ── 豪华家具 ──
  { id: 'sofa-emperor', name: '帝王沙发', category: 'luxury', price: 3000, icon: '👑',
    description: '真皮手工缝制帝王级沙发，镶金边', rarity: 'legendary',
    render: { type: 'rect', color: '#8b6040', width: 100, height: 40, slot: 'floor' } },
  { id: 'aquarium', name: '龙虾水族箱', category: 'luxury', price: 2000, icon: '🐠',
    description: '定制龙虾专属水族箱，带LED灯和过滤系统', rarity: 'epic',
    render: { type: 'rect', color: '#4a8090', width: 80, height: 50, slot: 'floor' } },
  { id: 'piano', name: '三角钢琴', category: 'luxury', price: 5000, icon: '🎹',
    description: '施坦威三角钢琴，小镇最贵的家具', rarity: 'legendary',
    render: { type: 'rect', color: '#1a1a1a', width: 90, height: 70, slot: 'floor' } },
  { id: 'hot-tub', name: '龙虾温泉浴缸', category: 'luxury', price: 4000, icon: '♨️',
    description: '人龙共浴的豪华温泉浴缸', rarity: 'legendary',
    render: { type: 'circle', color: '#6aaab0', width: 70, height: 35, slot: 'floor' } },

  // ── 电子设备与工作站 ──
  { id: 'computer-setup', name: '电脑工作站', category: 'tech', price: 1200, icon: '🖥',
    description: '27寸显示器+机械键盘+人体工学椅+升降桌，全套办公配置', rarity: 'epic',
    render: { type: 'rect', color: '#2a2a2a', width: 100, height: 70, slot: 'floor' } },
  { id: 'gaming-chair', name: '电竞椅', category: 'tech', price: 500, icon: '🪑',
    description: 'RGB灯效电竞椅，支持180度后仰', rarity: 'rare',
    render: { type: 'rect', color: '#333', width: 40, height: 60, slot: 'floor' } },
  { id: 'tv-55', name: '55寸智能电视', category: 'tech', price: 800, icon: '📺',
    description: '4K HDR 智能电视，内置直播频道', rarity: 'rare',
    render: { type: 'rect', color: '#1a1a1a', width: 80, height: 50, slot: 'wall' } },
  { id: 'stock-terminal', name: '股票交易终端', category: 'tech', price: 2500, icon: '📈',
    description: '专业级多屏行情终端，实时显示小镇股市', rarity: 'legendary',
    render: { type: 'rect', color: '#0a2a0a', width: 110, height: 60, slot: 'floor' } },
  { id: 'server-rack', name: '服务器机架', category: 'tech', price: 1800, icon: '🗄',
    description: '小型服务器机架，LED指示灯闪烁，可运行Agent', rarity: 'epic',
    render: { type: 'rect', color: '#2a2a2a', width: 40, height: 90, slot: 'floor' } },
  { id: 'sofa-l', name: 'L型转角沙发', category: 'furniture', price: 600, icon: '🛋',
    description: '布艺转角沙发，可坐4人，带脚踏', rarity: 'rare',
    render: { type: 'rect', color: '#8b7b6b', width: 100, height: 50, slot: 'floor' } },
  { id: 'tv-stand', name: '电视柜', category: 'furniture', price: 300, icon: '🗄',
    description: '简约电视柜，带收纳抽屉', rarity: 'common',
    render: { type: 'rect', color: '#6b5b4b', width: 90, height: 25, slot: 'floor' } },
  { id: 'whiteboard', name: '白板', category: 'tech', price: 200, icon: '📋',
    description: '磁性白板，头脑风暴必备', rarity: 'common',
    render: { type: 'rect', color: '#f0f0f0', width: 60, height: 40, slot: 'wall' } },
];

// ══════════════════════════════════════
// 龙虾宠物商店
// ══════════════════════════════════════

export interface LobsterPet {
  id: string;
  name: string;
  personality: string;
  color: string;      // 主色
  accentColor: string; // 副色
  pattern: 'solid' | 'striped' | 'spotted' | 'gradient';
  size: 'small' | 'medium' | 'large';
  price: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  trait: string;       // 特殊特质
  icon: string;
}

export const LOBSTER_PETS: LobsterPet[] = [
  // ── 普通龙虾 ──
  { id: 'lobster-red', name: '小红', personality: '活泼好动', color: '#e05040', accentColor: '#d04030',
    pattern: 'solid', size: 'small', price: 500, rarity: 'common', trait: '跑得最快', icon: '🦞' },
  { id: 'lobster-orange', name: '橘子', personality: '贪吃懒睡', color: '#e08040', accentColor: '#d07030',
    pattern: 'solid', size: 'medium', price: 500, rarity: 'common', trait: '吃货本色', icon: '🦞' },
  { id: 'lobster-brown', name: '可可', personality: '安静内向', color: '#8b6b4b', accentColor: '#7b5b3b',
    pattern: 'solid', size: 'small', price: 500, rarity: 'common', trait: '喜欢独处', icon: '🦞' },

  // ── 稀有龙虾 ──
  { id: 'lobster-blue', name: '蓝宝', personality: '高冷优雅', color: '#4080c0', accentColor: '#3070b0',
    pattern: 'solid', size: 'medium', price: 1500, rarity: 'rare', trait: '百万分之一的蓝色基因', icon: '💎' },
  { id: 'lobster-striped', name: '斑斑', personality: '调皮捣蛋', color: '#c06040', accentColor: '#f0e0c0',
    pattern: 'striped', size: 'medium', price: 1200, rarity: 'rare', trait: '独特的条纹花色', icon: '🐯' },
  { id: 'lobster-pink', name: '桃桃', personality: '温柔甜美', color: '#e090a0', accentColor: '#f0b0c0',
    pattern: 'gradient', size: 'small', price: 1500, rarity: 'rare', trait: '少女心爆棚', icon: '🌸' },

  // ── 史诗龙虾 ──
  { id: 'lobster-gold', name: '金龙', personality: '霸气侧漏', color: '#d4a850', accentColor: '#e8c870',
    pattern: 'gradient', size: 'large', price: 3000, rarity: 'epic', trait: '全身金色，财运象征', icon: '👑' },
  { id: 'lobster-galaxy', name: '星河', personality: '神秘莫测', color: '#4050a0', accentColor: '#8060c0',
    pattern: 'spotted', size: 'medium', price: 3500, rarity: 'epic', trait: '星空花纹，夜晚微微发光', icon: '🌌' },
  { id: 'lobster-crystal', name: '水晶', personality: '冷艳高贵', color: '#a0d0e0', accentColor: '#c0e8f0',
    pattern: 'gradient', size: 'large', price: 4000, rarity: 'epic', trait: '半透明甲壳，美得惊人', icon: '💠' },

  // ── 传奇龙虾 ──
  { id: 'lobster-rainbow', name: '彩虹', personality: '极度开朗', color: '#ff6060', accentColor: '#60c0ff',
    pattern: 'gradient', size: 'large', price: 8000, rarity: 'legendary', trait: '七色渐变甲壳，全镇仅此一只', icon: '🌈' },
  { id: 'lobster-ghost', name: '幽灵', personality: '来无影去无踪', color: '#d0d0d0', accentColor: '#f0f0f0',
    pattern: 'solid', size: 'small', price: 6000, rarity: 'legendary', trait: '白化基因，接近透明', icon: '👻' },
  { id: 'lobster-mecha', name: '机甲龙虾', personality: '酷炫战斗', color: '#606060', accentColor: '#40c0f0',
    pattern: 'spotted', size: 'large', price: 10000, rarity: 'legendary', trait: '装备微型机械钳，会发光', icon: '🤖' },
];

// ══════════════════════════════════════
// 玩家房间数据
// ══════════════════════════════════════

export interface PlayerRoom {
  userId: string;
  furniture: { itemId: string; x: number; y: number }[];  // 已放置的家具
  pets: { petId: string; name: string; happiness: number }[];  // 拥有的龙虾宠物
  wallColor: string;   // 墙壁颜色
  floorType: string;   // 地板类型
}

export interface PlayerWallet {
  userId: string;
  balance: number;
  totalEarned: number;
  totalSpent: number;
  transactions: { time: string; type: 'earn' | 'spend'; amount: number; desc: string }[];
}

// ══════════════════════════════════════
// 委托系统
// ══════════════════════════════════════

export interface Delegation {
  id: string;
  fromUserId: string;
  toAgentId: string;
  task: string;
  reward: number;       // 完成后 Agent 获得的报酬
  fee: number;          // 用户支付的费用（含手续费）
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  result?: string;
  createdAt: string;
  completedAt?: string;
}

// ══════════════════════════════════════
// 存储操作
// ══════════════════════════════════════

const MEMORY_DIR = './agent-memories';

export function loadPlayerRoom(userId: string): PlayerRoom {
  const p = join(MEMORY_DIR, userId, 'room.json');
  if (existsSync(p)) {
    try { return JSON.parse(readFileSync(p, 'utf-8')); } catch {}
  }
  return { userId, furniture: [], pets: [], wallColor: '#f5f0eb', floorType: 'wood' };
}

export function savePlayerRoom(room: PlayerRoom): void {
  const dir = join(MEMORY_DIR, room.userId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'room.json'), JSON.stringify(room, null, 2), 'utf-8');
}

export function loadWallet(userId: string): PlayerWallet {
  const p = join(MEMORY_DIR, userId, 'wallet.json');
  if (existsSync(p)) {
    try { return JSON.parse(readFileSync(p, 'utf-8')); } catch {}
  }
  return { userId, balance: 15000, totalEarned: 0, totalSpent: 0, transactions: [] };
}

export function saveWallet(wallet: PlayerWallet): void {
  const dir = join(MEMORY_DIR, wallet.userId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'wallet.json'), JSON.stringify(wallet, null, 2), 'utf-8');
}

/** 购买商品 */
export function buyItem(userId: string, itemId: string): { success: boolean; message: string } {
  const item = SHOP_ITEMS.find(i => i.id === itemId);
  if (!item) return { success: false, message: '商品不存在' };

  const wallet = loadWallet(userId);
  if (wallet.balance < item.price) return { success: false, message: `余额不足（需要 ${item.price}，当前 ${wallet.balance}）` };

  wallet.balance -= item.price;
  wallet.totalSpent += item.price;
  wallet.transactions.push({ time: new Date().toISOString(), type: 'spend', amount: item.price, desc: `购买 ${item.name}` });
  saveWallet(wallet);

  // 添加到房间
  const room = loadPlayerRoom(userId);
  // 智能摆放：大件靠前（靠墙），小件靠后，避免重叠
  const existingCount = room.furniture.length;
  const isLarge = ['computer', 'stock', 'piano', 'aquarium', 'sofa-emperor', 'sofa-l', 'hot-tub'].some(k => itemId.includes(k));
  const isWall = item.render.slot === 'wall';
  const isCeiling = item.render.slot === 'ceiling';

  let posX: number, posY: number;
  if (isWall) {
    // 挂件：沿墙壁从左到右排列
    posX = 80 + (existingCount % 5) * 120;
    posY = -100 - Math.floor(existingCount / 5) * 60;
  } else if (isCeiling) {
    posX = 300; posY = -150;
  } else if (isLarge) {
    // 大件：靠墙中央区域
    posX = 100 + (existingCount % 3) * 200;
    posY = -20;
  } else {
    // 普通家具：分散摆放
    const col = existingCount % 4;
    const row = Math.floor(existingCount / 4);
    posX = 80 + col * 150;
    posY = 20 + row * 40;
  }

  room.furniture.push({ itemId, x: posX, y: posY });
  savePlayerRoom(room);

  return { success: true, message: `成功购买 ${item.name}！已放置在房间中。` };
}

/** 购买龙虾宠物 */
export function buyPet(userId: string, petId: string, customName?: string): { success: boolean; message: string } {
  const pet = LOBSTER_PETS.find(p => p.id === petId);
  if (!pet) return { success: false, message: '宠物不存在' };

  const wallet = loadWallet(userId);
  if (wallet.balance < pet.price) return { success: false, message: `余额不足（需要 ${pet.price}，当前 ${wallet.balance}）` };

  const room = loadPlayerRoom(userId);
  if (room.pets.length >= 5) return { success: false, message: '最多养 5 只龙虾' };

  wallet.balance -= pet.price;
  wallet.totalSpent += pet.price;
  wallet.transactions.push({ time: new Date().toISOString(), type: 'spend', amount: pet.price, desc: `购买龙虾 ${pet.name}` });
  saveWallet(wallet);

  room.pets.push({ petId, name: customName || pet.name, happiness: 80 });
  savePlayerRoom(room);

  return { success: true, message: `恭喜获得 ${pet.rarity === 'legendary' ? '🌟传奇' : pet.rarity === 'epic' ? '💎史诗' : pet.rarity === 'rare' ? '✨稀有' : ''} 龙虾「${customName || pet.name}」！` };
}

/** 创建委托 */
export function createDelegation(userId: string, agentId: string, task: string, reward: number): { success: boolean; delegation?: Delegation; message: string; pricing?: any } {
  const serviceFee = Math.ceil(reward * 0.2);
  const totalCost = reward + serviceFee;
  const wallet = loadWallet(userId);
  if (wallet.balance < totalCost) return { success: false, message: `余额不足（需要 ${totalCost} Token = ${reward} 报酬 + ${serviceFee} 手续费，当前 ${wallet.balance}）` };

  wallet.balance -= totalCost;
  wallet.totalSpent += totalCost;
  wallet.transactions.push({ time: new Date().toISOString(), type: 'spend', amount: totalCost, desc: `委托 ${agentId}: ${task.slice(0, 30)}` });
  saveWallet(wallet);

  const delegation: Delegation = {
    id: `dlg-${Date.now().toString(36)}`,
    fromUserId: userId,
    toAgentId: agentId,
    task,
    reward,
    fee: totalCost,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  // 保存委托
  const dlgDir = join(MEMORY_DIR, userId, 'delegations');
  mkdirSync(dlgDir, { recursive: true });
  writeFileSync(join(dlgDir, delegation.id + '.json'), JSON.stringify(delegation, null, 2), 'utf-8');

  // 同时写入 daily log
  const dailyDir = join(MEMORY_DIR, userId, 'daily');
  mkdirSync(dailyDir, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const logPath = join(dailyDir, `${today}.json`);
  let dailyLog: any[] = [];
  if (existsSync(logPath)) { try { dailyLog = JSON.parse(readFileSync(logPath, 'utf-8')); } catch {} }
  dailyLog.push({ type: 'delegate', delegationId: delegation.id, agentId, task: task.slice(0, 50), reward, serviceFee, totalCost, timestamp: delegation.createdAt });
  writeFileSync(logPath, JSON.stringify(dailyLog, null, 2), 'utf-8');

  return {
    success: true,
    delegation,
    pricing: { reward, serviceFee, totalCost, pricingRule: 'reward + 20% service fee' },
    message: `委托已创建，费用 ${totalCost} Token（报酬 ${reward} + 手续费 ${serviceFee}）`,
  };
}

/** 序列化商店数据供前端使用 */
export function serializeShopData(): string {
  return JSON.stringify({
    items: SHOP_ITEMS.map(i => ({
      id: i.id, name: i.name, category: i.category, price: i.price,
      icon: i.icon, description: i.description, rarity: i.rarity,
    })),
    pets: LOBSTER_PETS.map(p => ({
      id: p.id, name: p.name, personality: p.personality, color: p.color,
      accentColor: p.accentColor, pattern: p.pattern, size: p.size,
      price: p.price, rarity: p.rarity, trait: p.trait, icon: p.icon,
    })),
  });
}
