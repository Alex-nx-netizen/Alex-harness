---
name: a6-validator
version: 0.1.0
description: "校验元。A5 执行完后自动检测项目类型，跑测试/lint/类型检查，输出结构化 ValidationReport。/a6-validator 手动触发，或 helix 编排 Step 8 自动调用。"
status:
  can_run: true
---

# A6 validator — 校验元

> **设计源**：`design/a6-validator-draft.md` v0.1

## §0 职责

执行完代码修改后，自动跑验证命令，给出通过/失败的明确结论，**不让 A5 的输出停留在"未验证"状态**。

## §1 执行方式

运行脚本检测项目类型并执行验证：
```bash
node .claude/skills/a6-validator/run.cjs
```

## §2 检测逻辑

脚本按以下顺序检测并执行：

| 检测文件 | 执行命令 |
|---------|---------|
| `tsconfig.json` | `npx tsc --noEmit` |
| `.eslintrc*` / `eslint.config.*` | `npx eslint src/` |
| `package.json` → `scripts.test` | `npm test` / `pnpm test` |
| `Cargo.toml` | `cargo test` |
| `go.mod` | `go test ./...` |
| `requirements.txt` / `pyproject.toml` | `python -m pytest` |

## §3 Claude 补充分析

脚本运行后，Claude 根据输出：
- 解释错误原因（不只是贴报错）
- 定位到具体文件和行号
- 给出修复建议
- 判断是否需要重新调用 A5

## §4 输出格式（ValidationReport）

```json
{
  "passed": false,
  "checks": [
    {"name": "tsc", "status": "pass", "duration_ms": 1200},
    {"name": "eslint", "status": "fail", "output": "src/auth.ts:23 error: ..."},
    {"name": "tests", "status": "pass", "output": "42 passed, 0 failed"}
  ],
  "summary": "1/3 checks failed",
  "action_required": "Fix ESLint error in src/auth.ts:23"
}
```

## §5 触发方式

```
/a6-validator
```

或由 helix Step 8 / A5 完成后自动调用。
