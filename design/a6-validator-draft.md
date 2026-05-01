# A6 validator — 校验元设计草案

> **状态**: v0.1（2026-5-1）
> **优先级**: P4
> **职责**: 执行后自动跑测试/lint/类型检查，输出结构化 ValidationReport

## 检测项目类型

| 特征文件 | 判定类型 | 测试命令 |
|---------|---------|---------|
| package.json | Node.js | npm test / pnpm test |
| tsconfig.json | TypeScript | tsc --noEmit |
| Cargo.toml | Rust | cargo test |
| go.mod | Go | go test ./... |
| requirements.txt | Python | pytest |
| .eslintrc* | ESLint | eslint src/ |

## 输出格式（ValidationReport）

```json
{
  "passed": false,
  "checks": [
    {"name": "tsc", "status": "pass", "output": ""},
    {"name": "eslint", "status": "fail", "output": "src/auth.ts:23 error"},
    {"name": "tests", "status": "pass", "output": "42 passed"}
  ],
  "summary": "1 check failed",
  "action_required": "Fix ESLint error in src/auth.ts:23"
}
```

## 触发方式

- helix 编排时，A5 执行后自动调用
- `/a6-validator` 手动触发
