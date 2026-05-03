# Helix E2E Fixtures (E4)

> 回归测试夹具：把已知的"任务输入 + 期望 phase 输出骨架"封进 JSON，让 `replay.cjs` 跑一次完整链路并产 diff 报告。
> 不强制全 phase 通过，重点是 **链路能跑通 + diff 报告可读**，从而能在 helix / phase skill 改动后快速回归。

## 目录约定

```
_meta/e2e-fixtures/
├─ README.md                    # 本文件
├─ replay.cjs                   # replay 跑批脚本
├─ 01-simple-task.json          # fixture 1：最简单的任务全链路
└─ ... (后续可加 02 / 03 ...)
```

## Fixture 文件格式（JSON）

```json
{
  "fixture_id": "01-simple-task",
  "description": "最简单任务：单文件改动 + 日志写入 + 单条 finding 记录",
  "input": {
    "task": "在 _meta/progress.md 顶部追加一条今日产出条目",
    "task_label": "/helix",
    "user_intent": "log_today_progress"
  },
  "expected_phases": [
    {
      "phase": "mode-router-coarse",
      "passes": true,
      "must_have_keys": ["mode_chosen"]
    },
    {
      "phase": "a1-task-understander",
      "passes": true,
      "must_have_keys": ["task_card", "user_goal"]
    },
    {
      "phase": "a2-repo-sensor",
      "passes": true,
      "must_have_keys": ["touched_files"]
    },
    {
      "phase": "a4-planner",
      "passes": true,
      "must_have_keys": ["plan_steps"]
    },
    {
      "phase": "mode-router-fine",
      "passes": true,
      "must_have_keys": ["execution_mode"]
    },
    {
      "phase": "a5-executor",
      "passes": true,
      "must_have_keys": ["actions_taken"]
    },
    {
      "phase": "a6-validator",
      "passes": true,
      "must_have_keys": ["checks"]
    },
    {
      "phase": "a7-explainer",
      "passes": true,
      "must_have_keys": ["summary"]
    }
  ]
}
```

## 用法

### 1. 跑单个 fixture

```bash
node _meta/e2e-fixtures/replay.cjs --fixture 01-simple-task.json
```

### 2. 跑所有 fixture（默认行为）

```bash
node _meta/e2e-fixtures/replay.cjs
```

### 3. 输出位置

每次跑批生成 `_meta/e2e-fixtures/.last-replay-report.json`，结构：

```json
{
  "ts": "2026-5-4 00:30:00",
  "fixtures": [
    {
      "fixture_id": "01-simple-task",
      "ok": true,
      "phases_observed": ["mode-router-coarse", "a1-task-understander", ...],
      "phases_expected": [...],
      "diffs": [
        { "phase": "a4-planner", "kind": "missing_key", "key": "plan_steps" }
      ]
    }
  ]
}
```

## 重要注意

- **不强制全 phase 通过** — 这是"回归探针"不是"正确性证明"。只要 replay 能跑下来 + diff 报告可读，就算 PASS。
- **不真正调 LLM** — 当前 replay 走的是 dry-run 模式：从 `_meta/helix-runs.jsonl` 历史里挑近似 run 当 ground truth 比对。后续若有 LLM-replay 模式再扩展。
- **写完产物必校验** JSON（CLAUDE.md 工作约定 #8）。
- **路径 `\` 在 JSON 字符串里要写 `\\`**（CLAUDE.md 工作约定）。

## 加新 fixture 的小步流程

1. 在本目录新建 `NN-<short-name>.json`，按上面格式写
2. `node -e "JSON.parse(require('fs').readFileSync('_meta/e2e-fixtures/NN-<name>.json','utf-8'))"` 校验
3. `node _meta/e2e-fixtures/replay.cjs --fixture NN-<short-name>.json` 跑一次
4. 读 `.last-replay-report.json` 看 diff，调整 `expected_phases`
5. 入库（git add）
