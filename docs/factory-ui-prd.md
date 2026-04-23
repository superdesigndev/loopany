# Loopany Factory UI — 设计需求文档 (PRD)

> 交付对象：UI / 视觉设计师
> 版本：v0.1 · 2026-04-22
> 作者：Tim Shi · tim@superdesign.dev

---

## 1. 产品是什么

**Loopany** 是一个长期运行的"agent 大脑" —— 用 markdown + frontmatter 作为存储格式，记录 agent 看到的所有输入、做过的所有事、归纳出的信念。详见项目 CLAUDE.md。

**Factory UI** 是 Loopany 的一个可视化前端：把当前用户 workspace 里的所有 artifacts（signal / task / goal / learning / skill-proposal / person / brief）以 Mindustry/Factorio 风格的"像素工厂"形式呈现。用户可以用一个像素角色走动观察，悬停鼠标查看节点之间的关系。

**为什么是工厂而不是表格/看板**

- Loopany 的单位不是"记录"而是"动作 + 结果"，节点之间是**因果关系**而非仅语义相似
- 信号进来 → 任务处理 → 成果产出 → 反馈沉淀为 learning / skill-proposal —— 天然是**流水线**
- 工厂能直观表达"东西在流动"的活感，而表格/看板表达不了
- 游戏化 ≠ 玩具化：目的是**让你在五秒内看懂 agent 目前在生产什么、哪里堵了**

## 2. 用户与使用场景

**主要用户**
- Loopany 的开发者或使用者本人 —— dogfooding 自己的 agent workspace
- 技术背景、愿意走进编辑器查看 .md 源文件

**主要场景**
1. 日常巡视："今天 agent 在忙什么？有什么卡住的？"
2. 调试："为什么这个任务存在？它引发了什么？"（追踪因果关系）
3. 演示：给非技术观众展示 Loopany 项目

**次要场景**
- 打开编辑器查看/编辑某个 artifact 的详情（UI 不承担编辑功能，只做跳转）

**反面不是谁**
- 不是团队协作工具（单用户本地）
- 不是 admin 后台（不做 CRUD）
- 不是看板 / Airtable / Notion 的替代品

## 3. 核心隐喻（**已锁定**，不要重设计）

| Loopany 概念 | 工厂中的对应 |
|---|---|
| artifact 节点 | 机器（assembler / drill / lab） |
| reference / mention | 传送带 |
| domain（`crewlet` / `ads` 等） | 工厂分区 |
| 玩家角色 | 工厂巡视员，用的是 **Crewlet 头像** |
| 状态（running / done / failed） | 机器工作灯 |
| relation 类型（caused-by / cites...） | 不同颜色的带子 |

视觉风格方向：**Mindustry 风像素工厂**（暗底、像素/几何化、带子有流动的小方块、不同功能模块颜色可辨）。

## 4. 当前实现一览

运行命令：

```bash
bun run src/cli.ts factory
```

会起一个本地 server 在 `http://127.0.0.1:4242`，自动弹出浏览器。

**技术栈（可以重选，不是硬约束）**
- Bun HTTP server 提供 HTML + JSON API
- 前端：单 HTML 文件 + Kaplay 2D 游戏引擎 + dagre 图布局（均 CDN）
- 零构建步骤

**目前长什么样**
- 暗底 + 正方形卡片（200×200），卡片上只有 kind icon、id、截断的 title、底部 4px status 色条
- dagre 分层布局 + 正交 3 段折线带子 + 流动小方块
- 左上角 info bar、底部左下控制提示、顶部居中 HUD 面板
- Crewlet 头像角色，WASD 控制，可穿透卡片和带子
- 鼠标悬停带子 → HUD 切换显示两端节点 + relation
- 玩家靠近某个卡片（半径 ~220px）→ HUD 显示该节点详情，按 E / Space / Enter 或直接点卡片 → 用户默认编辑器打开 .md 文件

> **设计师：上述实现**都**可以重做**。数据接口（`/api/graph`）和"点击后打开编辑器"的契约不变即可。

## 5. 必须保留的决定

这些是产品取舍，不是视觉偏好：

1. **可穿透**：玩家走动不被卡片挡住。已明确过，不做碰撞
2. **点击节点 = 打开用户的 .md 编辑器**（通过 POST `/api/open`，服务端 spawn `open` / `cursor` / `code`），**不**在 UI 里内嵌编辑器
3. **只做可视化**，**不**做 CRUD 操作（不创建、不删除、不改状态）
4. **本地运行**，只绑 127.0.0.1，无认证
5. **玩家角色是 Crewlet logo**（已在 `src/ui/crewlet.svg`，像素工厂动物）
6. **数据从 `~/loopany/` 读**，UI 不定义数据结构

## 6. 数据模型（设计师需要显示的内容）

### 6.1 节点（artifact）

```ts
{
  id: string;              // 例：'tsk-20260422-072256'
  kind: string;            // 目前：goal | signal | task | brief | learning | skill-proposal | person
  title: string;           // 人工写的标题，可能很长（100+ 字符）且前缀含 [brackets]
  status: string | null;   // 状态机：running, todo, in_review, done, failed, cancelled,
                           //        pending, accepted, rejected, active, archived
  domain: string | null;   // 目前：crewlet, ads；用户可新增
  path: string;            // 绝对路径，用于打开编辑器
  preview: string;         // body 前 5 行（markdown）
  createdAt: string;       // ISO 时间戳
}
```

当前 workspace 有 **11 个节点**，分布：
- 1 个 goal
- 3 个 signal
- 6 个 task
- 1 个 person

### 6.2 边（reference）

```ts
{
  from: string;        // 节点 id
  to: string;          // 节点 id
  relation: string;    // caused-by / led-to / cites / follows-up / mentions / supersedes / ...
  implicit: boolean;   // true = 从 frontmatter.mentions 或 body [[link]] 推断
                       // false = 从 references.jsonl 显式写入
}
```

当前 **19 条边**，绝大多数是 `mentions`（implicit）。同一对节点之间可能有多条不同 relation 的边。

### 6.3 域（domain）

可配置的组织单元。每个域是一个纯字符串。当前启用 `crewlet` + `ads`，未来会扩到 10+ 个域。

### 6.4 枚举的 kind / status / relation 都是**开放注册表**

- 用户可以自己定义新 kind（见 `kinds/*.md`）
- 新 kind 没有预设图标/颜色时应有合理 fallback（现在是 `◆`）
- 同理 status 和 relation

## 7. 屏幕清单（所有状态）

| # | 状态 | 触发 | 现有设计 |
|---|---|---|---|
| A | 主场景 | 默认 | 工厂地图 + 玩家 |
| B | 加载中 | 首次 fetch `/api/graph` | 居中 "Loading factory…" |
| C | 加载失败 | API 报错 | 居中红字错误 |
| D | 空工作区 | `nodes.length === 0` | **未设计** |
| E | 玩家靠近节点 | 距离 < 220px | HUD 显示节点详情，节点高亮脉动 |
| F | 鼠标悬停带子 | mouse on edge | HUD 切换为边详情（from / relation / to） |
| G | Toast 提示 | 打开编辑器后 | 顶部中央瞬时提示 |

### 7.1 主场景持续可见的元素

- **顶部左上**：工作区路径 + 统计（`11 artifacts · 19 refs · domains: crewlet, ads`）
- **顶部居中**：HUD 面板（按需出现）
- **底部左下**：控制提示（`WASD` `E` `R`）
- **主画布**：domain 区块（底层）→ 传送带 → 卡片 → 玩家

## 8. 交互清单

| 输入 | 行为 |
|---|---|
| WASD / 方向键 | 玩家走动 |
| 鼠标 hover 带子 | HUD 切换为"边详情" |
| 玩家靠近卡片（半径触发） | HUD 切换为"节点详情" + 卡片脉动 |
| E / Space / Enter | 打开当前聚焦节点的 .md 文件 |
| 点击卡片 | 打开该卡片的 .md 文件（无需靠近） |
| R | 重载整个页面 |
| Esc | （保留给"俯瞰模式"，第二版） |

**HUD 优先级**：边 hover > 玩家靠近 > 无

## 9. 视觉语言 & 设计机会点

### 9.1 必须做到

- **暗色底**（当前 `#0b0f14`，可微调）
- **像素/工业气质**（不是 macOS / iOS 风）
- **kind 可辨**：一眼能看出哪个节点是 signal 哪个是 task
- **status 可辨**：一眼能看出哪些节点在 `running`、`done`、`failed`
- **domain 可辨**：同域节点有视觉亲缘感
- **relation 可辨**：不同颜色/纹理的带子
- **动态感**：东西在流动（传送带上的包裹、running 机器的闪烁）

### 9.2 开放给设计师决定

1. **卡片视觉**：形状是否一定正方形？内部版面？
2. **kind 图标体系**：现在是 emoji fallback（📡 ⚙ 📄 🎯 💡 🧬 👤），建议自绘像素 icon
3. **传送带**：颜色方案、动画、端点样式（箭头？发光？）
4. **交叉点**：之前试过 junction 方块但被移除，如果设计师有更好的交叉表达可以提案
5. **domain 区块**：现在只用边框色暗示，**需要正式的"地界"设计**（轮廓 / 底色 / 拼接逻辑）
6. **玩家角色**：
   - 走动时有动画？
   - 静止时有 idle 动画？
   - 靠近节点时动作变化？
7. **HUD**：现在是 DOM 矩形弹窗，可以完全重设计
8. **info bar / 控制提示 / toast**：整套 chrome 都可以重做
9. **空态**：`/api/graph` 返回空节点时显示什么
10. **加载态**：现在是 "Loading factory…" 文字，可以是加载动画
11. **声音**？—— 开放讨论

### 9.3 当前色彩（供参考，不是定案）

```
Status:   running 黄 · todo 灰 · done 绿 · failed 红 · pending 橙
Relation: caused-by 红 · led-to 绿 · cites 蓝 · follows-up 橙 · mentions 灰
Domain:   从一个 8 色像素调色板 hash 分配
```

## 10. Non-goals（本版不做，避免设计过度）

- ✗ 拖拽节点自定义位置
- ✗ 小地图（mini map）
- ✗ 过滤 / 搜索 / 按时间范围查看
- ✗ 大屏幕适配之外的任何响应式（不做移动端）
- ✗ 实时协作
- ✗ 主题切换（第一版只做暗色）
- ✗ 在 UI 里改 artifact 内容 / 状态
- ✗ Skill-proposal 的内联 accept/reject 按钮（用编辑器跳转就够了）

## 11. 希望设计师交付的材料

1. **主场景 mockup**（高清，带当前 workspace 数据 ≥ 10 节点）
2. **节点卡片细节稿**（每个 kind 一张，各种 status 状态）
3. **传送带细节稿**（各种 relation 色彩、静帧 + 动画说明）
4. **Domain 区块设计**（2 个域 + 3 个域的情况）
5. **玩家角色稿**（静态 + 走动 frames）
6. **HUD 两种模式稿**（节点 / 边）
7. **Loading / Error / Empty 三态稿**
8. **图标组**：每个 kind 一枚像素 icon（≥ 当前 7 种）
9. **色板表**：status / relation / domain 的完整配色
10. **动画说明**：哪些元素动、怎么动、频率（文档即可，不需要视频）

**尺寸基准**：主场景设计目标 macOS 26" 显示器（2560×1600），设计稿 @2x。角色移动视口大致 1400×900。

## 12. 开放问题

以下没有定案，设计师可以给建议：

1. **大规模**：100+ 节点时如何优雅降级？Level-of-detail / 缩放？
2. **"仓库"分层**：未来 brief / learning / skill-proposal 生产出来后，要不要设计专门的"成品仓"区块？
3. **时间维度**：要不要在画布上体现"新的 artifact 在最右边，老的在最左边"？目前 dagre 是纯拓扑排序
4. **玩家进入工厂的第一印象**：需不需要一个"车间门"/"入口" 仪式感？
5. **发现性**：新用户第一次打开，不知道能走路、按 E、hover 带子 —— 是否需要引导？

## 13. 约束与交付物所在

- **代码仓库**：`/Users/stonex/Workspace/loop`
- **本文档**：`docs/factory-ui-prd.md`
- **当前 UI 源文件**：`src/ui/index.html`（单文件，看起来更直观）
- **数据接口**：`src/ui/graph.ts`（server 输出给前端的 JSON 形状）
- **示例数据**：`~/loopany/artifacts/`

设计师可以直接 `bun run src/cli.ts factory` 跑起当前版本对照，不需要读代码。

## 附录 A · 当前实现截图位置

随本 PRD 附最后一版截图（6 个 task + 1 个 prs-self + 连线），以及流水线演进过程中的前几版。设计师可以看到哪些方向已经试过不合适。

## 附录 B · 术语速查

| 词 | 意思 |
|---|---|
| artifact | 一份 markdown + frontmatter，Loopany 的最小存储单位 |
| kind | artifact 的类型标签，例如 signal / task |
| domain | artifact 的组织分区，用户可配置 |
| reference / edge | artifact 之间的有向关系 |
| implicit edge | 从 frontmatter `mentions[]` 或 body `[[id]]` 推断出来的边 |
| explicit edge | 显式写入 `references.jsonl` 的边 |
| status | artifact 的生命周期状态，由各 kind 的 state machine 约束 |
| relation | 边的类型，例如 caused-by / cites / mentions |
| lane | （已弃用）早期按 kind 分行的布局概念 |
| channel | 同一 rank-gap 中每条边占用的独立水平通道 |
