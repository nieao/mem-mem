/**
 * 龙虾小镇
 *
 * 20 位拥有不同 MBTI 人格和虚拟技能的 Agent，
 * 在 Game Master 的引导下讨论 OpenClaw 的核心议题。
 *
 * 用法:
 *   bun run src/index.ts              # 真实 LLM 模式
 *   bun run src/index.ts --mock       # Mock 模式（不消耗 API）
 *   bun run src/index.ts --topics 3   # 指定话题数
 */

import { runTown, DEFAULT_CONFIG } from './town.js';
import type { SimConfig } from './types.js';

// ── 解析命令行参数 ──────────────────

function parseArgs(): Partial<SimConfig> {
  const args = process.argv.slice(2);
  const config: Partial<SimConfig> = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--mock':
        config.mockMode = true;
        break;
      case '--topics':
        config.topicCount = parseInt(args[++i], 10);
        break;
      case '--rounds':
        config.roundsPerTopic = parseInt(args[++i], 10);
        break;
      case '--speakers':
        config.speakersPerRound = parseInt(args[++i], 10);
        break;
      case '--agents':
        config.agentCount = parseInt(args[++i], 10);
        break;
      case '--model':
        config.model = args[++i];
        break;
      case '--output':
        config.outputDir = args[++i];
        break;
      case '--topic':
        if (!config.customTopics) config.customTopics = [];
        config.customTopics.push(args[++i]);
        break;
      case '--topic-file':
        config.customTopicFile = args[++i];
        break;
      case '--topic-mode':
        config.topicMode = args[++i] as SimConfig['topicMode'];
        break;
      case '--no-crucix':
        config.crucixEnabled = false;
        break;
      case '--no-persist':
        config.persistMemory = false;
        break;
      case '--serve':
        config.serve = true;
        break;
      case '--no-serve':
        config.serve = false;
        break;
      case '--port':
        config.serverPort = parseInt(args[++i], 10);
        break;
      case '--token-budget':
        config.tokenBudget = parseInt(args[++i], 10);
        break;
      case '--help':
        printHelp();
        process.exit(0);
    }
  }

  return config;
}

function printHelp() {
  console.log(`
龙虾小镇

用法: bun run src/index.ts [选项]

选项:
  --mock              Mock 模式，不调用 LLM（用于测试）
  --topics <N>        讨论话题数（默认 ${DEFAULT_CONFIG.topicCount}）
  --rounds <N>        每话题讨论轮数（默认 ${DEFAULT_CONFIG.roundsPerTopic}）
  --speakers <N>      每轮发言人数（默认 ${DEFAULT_CONFIG.speakersPerRound}）
  --agents <N>        居民总数（默认 ${DEFAULT_CONFIG.agentCount}，最大 20）
  --model <name>      LLM 模型（默认 ${DEFAULT_CONFIG.model}）
  --output <dir>      报告输出目录（默认 ${DEFAULT_CONFIG.outputDir}）
  --topic <text>      自定义话题（可多次使用）
  --topic-file <path> 从 JSON 文件加载话题
  --topic-mode <mode> 话题模式：custom/default/mixed
  --no-crucix         禁用 Crucix 情报集成
  --no-persist        禁用记忆持久化
  --serve             模拟完成后启动任务服务器（可在报告中给 Agent 分配任务）
  --port <N>          任务服务器端口（默认 3456）
  --help              显示帮助

示例:
  bun run src/index.ts --mock                    # 快速测试
  bun run src/index.ts --topics 2 --rounds 3     # 2 话题 x 3 轮
  bun run src/index.ts --model claude-sonnet-4-6  # 用 Sonnet 模型
  bun run src/index.ts --topic "AI 是否应该有情感？" --topic "Agent 安全边界"
  bun run src/index.ts --topic-file my-topics.json --topic-mode custom
`);
}

// ── 主函数 ──────────────────

async function main() {
  const config = parseArgs();

  try {
    await runTown(config);
  } catch (err) {
    console.error('\n模拟出错:', err);
    process.exit(1);
  }
}

main();
