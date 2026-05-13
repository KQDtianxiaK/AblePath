<p align="right">
  <a href="./README.md"><img alt="English README" src="https://img.shields.io/badge/English-README-2563eb?style=for-the-badge"></a>
  <a href="./README.zh-CN.md"><img alt="中文 README" src="https://img.shields.io/badge/%E4%B8%AD%E6%96%87-README-dc2626?style=for-the-badge"></a>
</p>

# AblePath

**AblePath 是一个本地优先的 AI 桌面助手，面向行动能力受限、需要更轻松使用电脑的人。**

它把文字指令、语音输入、屏幕理解和安全受控的 AI 执行循环结合起来，帮助用户更自主地操作电脑。项目由本地 Node.js API、Vue 设置与诊断面板、Electron 桌面悬浮助手，以及隐私友好的照护者页面组成。

当前版本是以 Windows 为主的本地 MVP。它的目标是成为辅助控制层，而不是云账号产品、远程控制工具，或不受约束的自主 Agent。

## 项目理念

AblePath 旨在借助 AI 作为底层能力，帮助行动受限人员控制电脑。它希望在日常使用中成为一双由用户指挥的“数字双手”：负责执行屏幕操作、输入文字、点击按钮、打开应用、切换软件，让用户把更多精力留给思考、判断、创造、交流和工作本身。

AblePath 的长期目标不只是“让电脑更容易操作”，而是让行动受限人员也能以自己的方式参与劳动、工作、学习、家庭生活和数字社会。

## 版本演进

AblePath 的第一版方向基于 `nanoclaw` 开发，希望直接获取它底层的 Agent 能力。但 Agent 应用发展极快，几乎日新月异，如果把 AblePath 绑定到某一个 Agent runtime，反而会限制用户选择最新、最适合自己的 AI 工具。

因此，项目方向从“做一个 Agent 应用”调整为“帮助用户控制电脑”。只要能够稳定操控电脑，用户就可以自由使用各类 Agent 产品、网站、桌面软件和 AI 工具，而不是被锁定在一个集成栈里。

交互形态也因此发生了变化。真实的电脑操作如果只放在 Web 端会很不方便，所以 AblePath 现在改为以 Electron 悬浮窗作为主要用户入口。Web 端仍然保留，但主要承担后台设置、状态查看、诊断和管理职责。

AblePath 原本还计划把面向失能人员家人的病人状态监测功能直接开发在主体产品里。后续设计中，这部分被拆分为独立的照护者侧能力，只通过有权限边界的接口与 AblePath 主体交互。这样可以让“辅助控制电脑”和“家人查看状态”保持分离，也让隐私边界更清晰。

## AblePath 能做什么

- 将自然语言目标转换为结构化桌面操作计划。
- 让模型输出先进入 typed `ActionPlan`，而不是直接执行模型生成的代码。
- 支持打开应用、打开网址、点击、双击、输入文字、快捷键、滚动、等待、结束任务、请求用户介入等动作。
- 在用户开启屏幕上下文时，捕获并分析当前屏幕。
- 提供本地语音输入、文字转语音反馈，以及实验性的实时语音通路。
- 提供 Electron 悬浮助手，包含 Listen、Speak、Plan、Next、Dry-run、Confirm、Stop、SOS、screen、auto 等控制。
- 提供 Web 控制台，用于设置、Provider 状态、活动记录、任务、屏幕/控制诊断、紧急状态和照护者配置。
- 通过有权限范围和有效期的访问令牌，让照护者查看脱敏摘要和 SOS 状态。

## 产品原则

AblePath 的产品语言和系统设计都围绕自主选择、平静控制和家人安心。

- **本地优先：** 配置、活动、截图和运行状态默认保存在用户自己的机器上。
- **人工确认：** 有风险的动作先预览，再由用户确认后执行。
- **类型化安全边界：** AI 计划必须被归一化为白名单动作，才能进入执行器。
- **Provider 适配器：** AI 能力放在 Provider adapter 后面，避免绑定某一个 Agent SDK。
- **照护者隐私：** 照护者默认只能看到脱敏摘要，而不是完整控制权限。
- **紧急停止：** 桌面悬浮窗在执行循环中保持 Stop 和 SOS 可见。

## 项目架构

```text
ablepath/
  apps/
    server/       本地 HTTP API、Agent API、Provider、屏幕、语音、控制后端
    web/          Vue 用户控制台和照护者摘要页面
    desktop/      Electron 桌面悬浮助手
  packages/
    shared/       共享 API 类型、事件、契约、动作 schema
    core/         配置、存储、安全策略、AI plan 解析、Agent prompt
  scripts/
    start-windows-desktop.ps1
    check-windows-demo.mjs
    validate-mvp.mjs
  docs/
    ARCHITECTURE.md
    PRODUCT.md
    SAFETY.md
    WINDOWS_ADAPTERS.md
    PLAN.md
```

桌面端不会直接执行电脑操作。它会调用本地 AblePath server，server 只会在确认边界之后执行已归一化、已进入白名单的 `ActionPlan` 步骤。

## 核心 API

当前 Agent 循环主要通过以下接口工作：

```text
POST /api/agent/command
POST /api/agent/confirm
POST /api/agent/step
POST /api/agent/stop
GET  /api/agent/recent
```

其他本地 API 覆盖聊天、视觉分析、屏幕截图、语音、TTS、控制诊断、活动记录、任务、安全设置、照护者、不活跃检测和 SOS。

## 支持的动作类型

```text
openUrl
openApp
click
doubleClick
type
hotkey
scroll
wait
finished
callUser
```

当前 Windows 桌面控制使用内置 PowerShell 和 Windows API。未来可以接入更完整的原生后端，例如 `nut-js`，但仍然会放在同一个 typed executor 安全边界之后。

## 环境要求

- 当前 MVP 主要面向 Windows。
- Node.js 20 或更高版本。
- npm workspaces。
- 如果要测试 AI 聊天、视觉、ASR、实时语音，需要配置相应 Provider 凭据。

仓库中可能包含项目本地 Node runtime：

```text
.tools/node-v20.19.0-win-x64
```

你可以在 Windows 上使用这个本地 runtime，也可以安装全局 Node.js 20+。

## 配置

复制环境变量模板，然后只填写你需要测试的 Provider：

```powershell
Copy-Item .env.example .env
```

主要变量：

```text
ABLEPATH_HOST=127.0.0.1
ABLEPATH_PORT=4317
ARK_API_KEY=
DOUBAO_BASE_URL=
DOUBAO_CHAT_MODEL=
DOUBAO_VISION_MODEL=
VOLC_ASR_APP_KEY=
VOLC_ASR_ACCESS_KEY=
```

不要提交 `.env`、Provider key、照护者 token、截图或本地运行数据。

## 在 Windows 上运行

使用仓库内置 Node runtime：

```powershell
.\.tools\node-v20.19.0-win-x64\npm.cmd install
.\.tools\node-v20.19.0-win-x64\npm.cmd run build
powershell -ExecutionPolicy Bypass -File .\scripts\start-windows-desktop.ps1 -RestartServer
```

使用全局 Node.js：

```powershell
npm install
npm run build
powershell -ExecutionPolicy Bypass -File .\scripts\start-windows-desktop.ps1 -RestartServer
```

本地服务和用户 Web 控制台地址：

```text
http://127.0.0.1:4317
```

开发时建议带上 `-RestartServer`，避免启动脚本复用旧的健康 server 进程，导致最新代码没有生效。

## 开发命令

```powershell
npm run dev           # server 开发入口
npm run dev:web       # Vue 控制台开发服务
npm run build         # shared/core/server + web 构建
npm run typecheck     # TypeScript 和 Vue 类型检查
npm test              # workspace 测试
npm run check:demo    # Windows demo 检查
npm run validate:mvp  # 构建并运行 MVP 验证
```

## 当前 MVP 状态

已经实现并纳入自动化验证的能力：

- 本地 server 和 Vue 用户 Web app。
- 照护者 token 摘要流程。
- SOS 和紧急状态。
- Doubao chat/vision Provider adapter，以及 Volc/Doubao 语音通路。
- Agent command、confirm、step、stop、recent-session API。
- typed action-plan 解析、修复、审查和执行。
- Windows 截图、TTS、录音、实时音频和桌面控制 adapter。
- Electron 悬浮助手，支持有边界的 auto-execution 和 screen continuation。

已知缺口：

- 浏览器页面操作仍然过度依赖视觉点击。
- 还没有浏览器原生的“搜索结果/打开第一个官方网站结果”工具。
- 在标记 `finished` 前，需要更严格的执行后验证。
- 悬浮助手还需要可见的动作/结果日志。
- Stop 已能取消桌面端本地 auto-continuation，但服务端正在进行的 planning 还需要可取消机制。
- Hold-to-talk 还不是真正的“按住录音、松开停止”。
- 多显示器和高 DPI 坐标处理还需要更多真实机器测试。

## 安全说明

删除内容、发送消息、购买付款、公开发布、提交表单、授权远程协助等高风险动作都应该要求显式确认。AblePath 目前是辅助原型，真实使用前应先用低风险动作测试。

SOS 和照护者功能是本地 MVP 的安全辅助能力，不应替代急救服务或专业医疗监测。

## 项目文档

- [产品基线](./docs/PRODUCT.md)
- [架构说明](./docs/ARCHITECTURE.md)
- [安全基线](./docs/SAFETY.md)
- [Windows adapter](./docs/WINDOWS_ADAPTERS.md)
- [阶段账本](./docs/PLAN.md)
- [原始交接说明](./%E9%A1%B9%E7%9B%AE%E8%AF%B4%E6%98%8E.md)
