# Alex-harness: Dashboard 持久化 + GitHub PR 自动触发完整配置

> 编写时间: 2026-5-3 16:10
> 适用: Alex-nx-netizen/Alex-harness 仓库 + Claude Code Routines (research preview)

---

## 一、症状回顾

| 现象 | 实际原因 |
|------|---------|
| `http://localhost:7777` 打不开,`ERR_CONNECTION_REFUSED` | dashboard 是独立 Node 进程,helix 不会自动起它,只检测端口存活 |
| helix 输出 `[missing]` | 端口 7777 上没有 listener |
| GitHub PR 打开后 routine 没自动跑 | Claude Routines 的 GitHub trigger 依赖 GitHub App webhook;repo 列表里看到 Alex-harness ≠ webhook 已就位 |

---

## 二、Dashboard 持久化（先解决看不到的问题）

### 2.1 临时启动（验证用）

```bash
cd E:\ai\study\person\Alex-harness
node dashboard/server.js
```

打开 <http://127.0.0.1:7777> 即可看到。关掉终端就死。

### 2.2 后台常驻（推荐:Windows 任务计划程序）

PowerShell 以管理员身份执行:

```powershell
$action = New-ScheduledTaskAction `
  -Execute "node.exe" `
  -Argument "E:\ai\study\person\Alex-harness\dashboard\server.js" `
  -WorkingDirectory "E:\ai\study\person\Alex-harness"

$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERNAME"

$settings = New-ScheduledTaskSettingsSet `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
  -StartWhenAvailable

Register-ScheduledTask -TaskName "Alex-Harness-Dashboard" `
  -Action $action -Trigger $trigger -Settings $settings `
  -Description "HARNESS Dashboard on :7777" -Force

Start-ScheduledTask -TaskName "Alex-Harness-Dashboard"
```

校验:

```powershell
Get-ScheduledTask -TaskName "Alex-Harness-Dashboard" | Get-ScheduledTaskInfo
netstat -ano | findstr ":7777"
```

### 2.3 配 helix 不再误报 missing

helix 应该把 dashboard 当成"按需启动"的依赖,而不是必要前置。两种做法:

- **方案 A**: 在 helix run 之前先 `node dashboard/server.js &`(每次 helix 自启)
- **方案 B**: 让任务计划程序常驻,helix 只读 `/api/health`,不再尝试启动

推荐方案 B(已经在 2.2 配好)。

### 2.4 端口冲突 / 改端口

```bash
HARNESS_DASHBOARD_PORT=7878 node dashboard/server.js
```

---

## 三、GitHub PR 自动触发(核心问题)

### 3.1 触发链路

```
PR opened
  ↓ (GitHub App webhook)
Claude Code 后端
  ↓ (匹配 routine trigger)
启动 routine 实例
  ↓
执行 instructions(gh pr diff / gh pr comment / gh pr review)
```

任何一环断,自动触发就废了。下面逐环排查。

### 3.2 第 1 环:GitHub App 是否真的装在仓库上

仅仅在 routine 的 Repositories 下拉里能选到 `Alex-nx-netizen/Alex-harness`,**不代表** webhook 已就位。需要:

1. 浏览器打开:<https://github.com/settings/installations>
2. 找到 **Claude** 这个 GitHub App,点 **Configure**
3. **Repository access** 下,确认:
   - 选了 `Only select repositories`
   - 列表里包含 `Alex-nx-netizen/Alex-harness`
   - 或者直接选 `All repositories`(更省心,但权限大)
4. **Permissions** 至少要有:
   - `Pull requests: Read & Write`(让 routine 能 review/comment)
   - `Contents: Read`(让 `gh pr diff` 能读文件)
   - `Metadata: Read`(必填)
   - `Issues: Read & Write`(`gh pr comment` 走 issues API)
5. **Webhook events** 必须勾上 `Pull request`

如果上面任何一项没满足:点 Save 后,GitHub 会重新订阅事件。**装完之后再开下一个 PR,才会触发**——历史 PR 不会回放。

### 3.3 第 2 环:routine 配置确认

按截图 Edit routine 弹窗:

| 字段 | 当前值 | 是否正确 |
|------|--------|---------|
| Status | Active | ✓ |
| Repositories | Alex-nx-netizen/Alex-harness | ✓ |
| Trigger | Pull request opened (Custom) | ✓ |
| Filter | Base branch is one of `master` | ✓ |
| Connectors | (空) | **⚠ 待补** |

**关键漏洞: Connectors 是空的。** routine instructions 里写了 `gh pr diff` / `gh pr comment` / `gh pr review`,但执行环境里如果没有 GitHub connector,gh 命令要么不存在要么没鉴权。

修复:在 Edit routine 弹窗里 → Connectors → **Add connector** → 选 **GitHub**,授权 Alex-nx-netizen/Alex-harness。

### 3.4 第 3 环:Permissions tab

Edit routine 弹窗顶部有 `Connectors / Behavior / Permissions` 三个 tab。
点 **Permissions**,确认:

- `Bash` 允许执行 `gh *`
- 或者直接全开(Research preview 阶段可以)

否则即便 connector 装了,Claude 调 gh 时也会被拦下。

### 3.5 第 4 环:Filter 兼容性测试

当前 filter 是 `Base branch is one of master`。注意:

- 你的默认分支是 `master`(已确认 git log)
- 如果未来切到 `main`,这条 filter 会让所有 PR 都不触发
- 测试时,新建 PR 必须 base = master,不能是 base = 别的 branch

### 3.6 端到端验证步骤

1. 完成 3.2 + 3.3 + 3.4
2. 在本地建测试分支:
   ```bash
   git checkout -b test/auto-trigger-verify
   echo "trigger test $(date)" >> _meta/findings.md
   git add _meta/findings.md
   git commit -m "test: verify routine auto trigger"
   git push -u origin test/auto-trigger-verify
   ```
3. 开 PR(base=master):
   ```bash
   gh pr create --base master --head test/auto-trigger-verify \
     --title "test: routine auto trigger" \
     --body "verifying alex-pr-review routine"
   ```
4. **30 秒内**回 Claude Code Routines 页面,刷新 `alex-pr-review`
5. **Runs** 区应该出现新一条,标签是 **Webhook** 或 **API**(不是 MANUAL)
6. 如果出现 → 自动触发已通
7. 如果没出现 → 看 3.7 排查

### 3.7 没触发怎么排查

按概率排序:

1. **GitHub App 没装到 repo**:回 3.2 重看,**这是 80% 的根因**
2. **Save 没点**:Edit routine 后底部 Save 按钮 disabled = 表单未变更;改了一定要变 enable
3. **Filter 不匹配**:base branch 不是 master,或者 PR 是 draft(部分 trigger 会跳过 draft)
4. **Routine paused**:Status 显示 Paused 而不是 Active
5. **GitHub webhook delivery 失败**:仓库 → Settings → Webhooks(只在 repo 自己装 webhook 时有,GitHub App 不在这里)
6. **GitHub App webhook delivery**:<https://github.com/settings/installations> → Claude → Advanced → Recent Deliveries,看是否有红 ✗

---

## 四、最小可用配置一览

把下面 5 项打钩,自动触发就稳了:

- [ ] Dashboard 用任务计划程序常驻(2.2 完成)
- [ ] Claude GitHub App 装到 Alex-harness,prs/contents/metadata/issues 权限齐(3.2)
- [ ] routine Connectors 加 GitHub connector(3.3)
- [ ] routine Permissions 允许 Bash gh *(3.4)
- [ ] 用 3.6 做端到端验证,看到 Webhook tag 出现

---

## 五、附:routine instructions 微调建议

现在的 instructions 没问题,补两条让它更稳:

```diff
  你是 Alex-harness 的 PR 审查 agent。

  上下文:
  - 仓库 Alex-nx-netizen/Alex-harness
  - 触发 PR: {{trigger.pull_request.number}}
  - PR 标题: {{trigger.pull_request.title}}
  - PR diff: 用 gh pr diff {{trigger.pull_request.number}} 拿
+ - 工作目录: 由 GitHub connector 自动 checkout 到 PR 分支

  任务:
  1. 读 CLAUDE.md 和 _meta/task_plan.md, 了解项目当前阶段
  2. 检查 PR 是否违反"工作约定铁律"(小步迭代/先想后做/SKILL.md 留痕)
  3. 如有问题, 用 gh pr comment 贴行内评论
  4. 如果改了 skill, 确认 _meta/progress.md 有对应条目
  5. 最后用 gh pr review --approve 或 --request-changes
+ 6. 把审查摘要 append 到 _meta/pr-reviews.jsonl(单行 JSON,北京时间)

  不要直接 push 到 PR 分支。所有修改建议走评论。
+ 不要在评论里露 token / api key / 内部路径。
```

---

## 六、Risk

| 风险 | 触发场景 | 缓解 |
|------|---------|------|
| GitHub App 拿到 Read & Write,误操作可能改远程 | routine 写错命令(如 git push -f) | instructions 第 6 行明确禁止;routine 走 PR review 而不是 push |
| Dashboard 长期占 7777 端口 | 改了别的项目想用 7777 | 用 HARNESS_DASHBOARD_PORT 改端口;或停 Alex-Harness-Dashboard 任务 |
| webhook 滥用导致 Claude 跑很多次 | 自动化产 PR(bot/dependabot) | routine 加 filter:`PR author is not bot` |
| Connector 授权过宽 | 装 connector 时勾了 All repositories | 改成 only Alex-harness;或单建 GitHub App 专给 routine |

---

> 备忘:本文档对应 _meta/feishu-pr-auto-config.md 本地副本。
