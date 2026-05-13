# Refactor Cycle — 月度大扫除流程

> 节奏：每月 1 次（建议月初或月末挑半小时-1 小时）。
> 目的：把单次会话累积的冗余、dead code、重复块清掉，让 skills/ 总行数趋势下降。
> 来源：`design/redundant-code-solutions.md` §6.2 阶段 3 + Anthropic code-simplifier 设计哲学（"重构作为独立阶段"，而不是边写边改）。
> 配套铁律：CLAUDE.md "反冗余硬规则" + skills/code-simplifier/SKILL.md。

---

## 节奏与触发

| 项 | 约定 |
|---|---|
| 频率 | 每月 1 次（如 6-1 / 7-1 / 8-1） |
| 时长 | 30-60 分钟 |
| 触发方 | Alex 手动跑（不自动化，因为破坏性变更需人审） |
| 不做的事 | ❌ 跨月累积不跑 / ❌ 边写新代码边重构 / ❌ 跳过工具直接靠 LLM 目测找冗余 |

---

## 七步流程（仿 `SilenNaihin /refactor` gist）

### Step 1：项目体量基线

```bash
# 记录本月起始时的 skills/ 行数（与上月对比）
find skills -name "*.md" -o -name "*.cjs" -o -name "*.js" | xargs wc -l | tail -1
```

把数字记到 `_meta/findings.md`，开头标记 "refactor cycle #N (YYYY-M-D)"。

### Step 2：静态工具扫描（jscpd · 重复代码块）

```bash
# 一次性安装：npm i -g jscpd
npx jscpd skills/ --output ./.jscpd-report --reporters html,console --min-lines 6 --min-tokens 50 || true
```

**产出**：`.jscpd-report/jscpd-report.html`（人读）+ 控制台前 5 重复块（机器读）。

> `.jscpd-report/` 已在 `.gitignore`（如未在，加进去）。

### Step 3：静态工具扫描（knip · 未用导出 / 文件 / 依赖）

```bash
# 一次性安装：npm i -g knip
npx knip --reporter symbols 2>&1 | tee .knip-report.txt || true
```

如果项目根没有 package.json（当前 Alex-harness 是这种），跳过 knip，改用：

```bash
# 简易 dead code 检测：列出从未被 require/import 引用过的 .cjs 文件
node -e "
const fs=require('fs');const path=require('path');
const root='skills';
const files=[];
function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){
  const p=path.join(d,e.name);
  if(e.isDirectory())walk(p);
  else if(e.name.endsWith('.cjs')||e.name.endsWith('.js'))files.push(p);
}}
walk(root);
const refs=new Map(files.map(f=>[f,0]));
for(const f of files){
  const src=fs.readFileSync(f,'utf-8');
  for(const g of files){
    if(g===f)continue;
    const base=path.basename(g,path.extname(g));
    if(src.includes(base))refs.set(g,refs.get(g)+1);
  }
}
const orphans=[...refs.entries()].filter(([,c])=>c===0);
console.log('Potentially unused scripts (review manually):');
for(const [f]of orphans)console.log(' -',f);
"
```

### Step 4：人工 review · 挑 3 个最严重重复

不要试图一次清完所有。从 jscpd 报告挑出：

1. **最大的重复块**（行数最多）
2. **跨文件最多的重复**（被复制次数最多）
3. **核心路径上的重复**（在 helix / a1-a8 主链）

→ 写到一个临时 issue 列表，比如 `_meta/refactor-cycle-N-issues.md`。

### Step 5：调 code-simplifier 处理

针对每个 issue，让 LLM：

1. 派 `general-purpose` 或 `everything-claude-code:code-simplifier` subagent 分析具体重复
2. 输出 5 维评分 + findings（每条必须 `behavior_safe: true`，因为 cycle 只做无害简化）
3. 跑：

```bash
node skills/code-simplifier/run.cjs "$(cat input-for-issue-1.json)"
```

4. 看 score 总分：
   - **≥ 20**：直接 ship（apply 建议）
   - **12-19**：findings 进 commit message
   - **< 12**：soft_blocked → 暂停，回到 step 4 重新挑（说明这个 issue 不适合本 cycle）

5. 若有任何 `behavior_violations > 0` 的报告 → **立刻中止本条 issue**，改走 a5+a8 流程（破坏性确认）

### Step 6：跑全量测试（强制）

```bash
# 全项目最小验证（如有 package.json scripts）
[ -f package.json ] && npm test || echo "no package.json test script"

# Skill 脚本快速冒烟（每个 run.cjs 都用 --help 或空输入跑一次）
for f in skills/*/run.cjs; do
  echo "--- $f ---"
  node "$f" '{}' 2>&1 | tail -3
done

# helix 端到端
node skills/helix/run.cjs --start "refactor cycle smoke" 2>&1 | head -10
```

任何脚本异常 = 回滚本 cycle 的 commit，不进 Step 7。

### Step 7：单次 commit

```bash
git add -p   # 一定要 -p，逐 hunk 审，不要 -A
git commit -m "$(cat <<'EOF'
chore: monthly refactor cycle #N — 简化 X 处冗余，净 -Y 行

来源：_meta/refactor-cycle.md
- issue 1: skills/helix/run.cjs phase_report 解析提取
- issue 2: ...
- issue 3: ...

测试：所有 skill run.cjs 冒烟通过；helix --start 正常
报告：skills/code-simplifier/logs/runs.jsonl 最新 3 行；jscpd 总重复率 X% → Y%
EOF
)"
```

---

## 收尾（强制）

写一笔到 `_meta/findings.md`，主题是"refactor cycle #N 复盘"，至少回答 3 个问题：

1. **本月最反直觉的重复模式是什么？** —— 那种"明明知道在写但还是写了"的复制黏贴是哪一类？
2. **code-simplifier 的 5 维评分是否准？** —— 翻 `skills/code-simplifier/logs/runs.jsonl` 本月条目，看有没有 `_uniform_suspect=true` 或 `_source=default_fallback`，标记后续校准方向
3. **下个月要不要调 SKILL.md？** —— 如果 L1 日志里 `regressed=true` 出现 ≥1 次（即简化导致行为回归），下个月 cycle 前必须人审本 SKILL.md，否则不允许跑

---

## 与项目其他元的边界

| 元 | 跑的时机 | 关系 |
|---|---|---|
| `a5-executor §1.5 自检` | 每次 Edit/Write 前后 | 防新冗余进来 |
| `code-review` skill | helix Step 8.5（每次跑） | 检 5 维质量（含冗余但不专攻） |
| `code-simplifier` skill | 本 cycle / 手动 | 专攻冗余，5 维不同 |
| `a6-validator` | helix Step 9 | 机器 check 二元闸 |
| **本 cycle** | **每月 1 次** | **存量清理 + 趋势观察** |

→ 一句话：**a5/code-review 防"加得多"，本 cycle 治"积得久"**。

---

## 历史 cycle 记录

> 每跑一次 cycle，在下面追加一行（最新在上面）。

| Cycle # | 日期 | 起始行数 | 结束行数 | 净 Δ | 主要 issue | 复盘 |
|---|---|---|---|---|---|---|
| _(未开始)_ | _首次预计 2026-6-1_ | _-_ | _-_ | _-_ | _-_ | _-_ |
