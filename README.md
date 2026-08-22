# 知绘工厂（AI Content Studio）

面向抖音、TikTok 和小红书的 AI 科普漫剧生产控制台。这个仓库不重复训练基础模型，而是把成熟开源项目串成一条可审查的工作流：

`选题 → 剧本 → 事实核验 → 角色 → 分镜 → 图片/视频/配音 → 三平台包装 → 人工审核 → 经授权发布 → 指标回流`

私有线上操作台：<https://zhihui-ai-studio.songfy0118.chatgpt.site>

## 当前完成度

- 三平台选题池、相对评分和任务队列
- LocalMiniDrama 本机项目创建、恢复与防重复
- 事实核验记录、角色和分镜导入
- 抖音、TikTok、小红书三套文案与字幕草稿
- 文本、图片、视频、TTS 生产前检查
- 人工审核门禁和数据学习页面

试播项目“章鱼面试”目前包含 1 集剧本、2 个角色、6 个分镜和 75 秒三平台交付草稿。实际媒体生成仍需合法可用的模型服务配置。

## 架构

- `app/`：统一操作台和本机适配 API
- `db/`、`drizzle/`：云端选题、任务、账号和指标数据
- `scripts/`：开源引擎安装、试播项目导入、三平台包装
- `examples/`：不含密钥的试播配置和事实核验样例
- `vendor/`：本机开源引擎，仅在各自电脑下载，不进入本仓库

底层复用：

- [LocalMiniDrama](https://github.com/xuanyustudio/LocalMiniDrama)：本机主工作台
- [LumenX](https://github.com/alibaba/lumenx)：漫剧生产候选主引擎
- [MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo)：资讯口播备用
- [CosyVoice](https://github.com/FunAudioLLM/CosyVoice)：中文配音
- [MuseTalk](https://github.com/TMElyralab/MuseTalk)：数字人口型备用

## Windows 快速开始

需要 Node.js 22+、Git 和 PowerShell。

```powershell
npm install
npm run vendors:bootstrap
```

首次只安装当前主链路所需的 LocalMiniDrama 依赖：

```powershell
powershell.exe -ExecutionPolicy Bypass -File scripts\bootstrap-vendors.ps1 -InstallLocalMiniDrama
```

验证并启动：

```powershell
npm test
.\启动知绘工厂.bat
```

打开：

- 统一本机操作台：<http://127.0.0.1:3000>
- LocalMiniDrama：<http://127.0.0.1:3013>
- 模型配置：<http://127.0.0.1:3013/ai-config>

## 试播流程

```powershell
npm run pilot:import
npm run pilot:package
```

生成的发布草稿位于 `work/packages/octopus-pilot/`。该目录只保存本机产物，不进入 Git。

## 密钥与发布安全

- `.env*`、模型文件、数据库、生成缓存、`vendor/` 和发布产物均被 Git 忽略。
- 不要在 issue、PR、聊天或配置样例中粘贴 API Key、Cookie、验证码或平台 Token。
- 模型连通不代表允许商用；每个服务和素材都要单独确认授权范围。
- 所有平台发布必须经过人工事实核验、画面检查、版权检查和账号本人授权。
- 分数是相对排序，不是播放量承诺；演示和烟雾测试不能当成真实账号结果。

## 协作约定

- `main` 保持可运行；每项功能使用独立分支和 Pull Request。
- 不提交本机生成物、大模型、第三方仓库副本或任何密钥。
- 修改后至少运行 `npm test`。
- 接适配器时保留原始来源、失败原因和任务状态，禁止把失败包装成成功。

## 常用命令

- `npm run dev`：启动统一操作台开发环境
- `npm run local:doctor`：只读检查操作台、桥接服务和 LocalMiniDrama 前后端；不会重启进程、下载模型或调用外部服务
- `npm run bridge:restart:plan`：只读核验 3765 监听进程、旧桥接健康签名和协议 v3 目标；默认不停止或启动任何进程
- `npm run bridge:verify:parallel`：在临时端口 3766 启动并回收新版桥接，验证协议 v3 与隔离迁移接口；不改动 3765 旧桥接
- `npm run news:preview`：对已启用的公开 RSS 各发起一次限时只读请求，输出规范化标题、原文链接、时间与信源健康状态；不抓正文、不写数据库、不发布
- 当前自动 RSS 仅包括 OpenAI、Microsoft、Google、AWS、Apple、NVIDIA 与美国监管机构的公开源；每源最多 5 条、单源上限 1.5 MB、超时 8 秒，只保留标题、原文链接、时间和最多 240 字短摘要
- `npm run news:clusters`：在一次 RSS 只读预览上按标题词项、七天时间窗和独立来源进行确定性聚类；只输出候选资格，不执行热度预测、事实核验或数据库写入
- `npm run news:rank`：只对合格的跨来源簇计算来源多样性、报道数量、时效、聚类一致性和默认账号主题匹配的相对优先级；不生成播放量或爆款概率，事实核验前不可进入草稿
- `npm run news:gaps`：从七天内的单来源簇生成最多 12 条账号匹配补证线索与建议检索词；只允许加入本次页面的临时补证清单，不自动搜索、不保存选择，也不解锁来源锁或草稿
- `npm run news:search-plan -- <cluster-id...>`：为当前最多 3 条补证线索生成带指纹的第二来源检索计划；只列出无需登录的 RSS 与官方新闻室，不执行检索、不创建来源锁、不写数据库
- `npm run news:evidence-preview -- <cluster-id...>`：在人工选择后，仅用本轮公开 RSS 的标题、链接、来源和时间寻找可能的第二来源；不读取文章正文，所有结果必须人工判断，不执行事实核验、来源锁、草稿或发布
- `npm run news:evidence-review`：显示证据审查的失败关闭边界；真实预览必须由人选择当前候选并确认同一事件、来源独立、时间一致和无明显冲突，预览不保存、不创建来源锁
- `npm run news:source-lock-plan`：显示来源锁保存计划的失败关闭边界；真实计划绑定当前人工审查指纹，但授权、写库、来源锁创建与草稿解锁均保持关闭
- `npm run db:source-lock:plan`：只检查来源锁主表、证据明细表、指纹防重索引和 create-only 迁移；不会连接或修改线上数据库，也没有迁移应用入口
- `npm run db:source-lock:store:isolated`：用一次性内存 SQLite 验证来源锁保存口令、计划指纹绑定、幂等重放和原子批次回滚；写入器未连接任何 API 或真实 D1，不会创建业务来源锁
- `npm run db:source-lock:read:isolated`：用一次性内存 SQLite 验证按计划指纹读取完整来源锁；只接受 active 主记录和 original/independent 两条证据，未连接 API，不会把来源元数据误报为事实核验或草稿输入就绪
- `npm run news:text-brief:check`：验证来源锁只读投影到小红书/抖音图文研究简报的纯函数边界；简报只含人工角度、来源索引、待核问题和字段清单，不读取正文、不生成事实、文案或平台草稿
- `npm run news:article-plan:check`：验证两篇公开正文的合规获取计划；仅允许目录中已标注可归纳或官方公共记录的 HTTPS 来源，并固定单并发、大小/超时/跳转边界及登录墙、付费墙、CAPTCHA、robots、429 停止条件，不发出网络请求
- `npm run news:article-adapter:mock`：仅用注入的模拟网络与 robots 响应验证正文执行口令、计划防篡改、串行间隔、域内跳转、正文提取和失败即丢弃全部结果；适配器未连接 API，也没有执行真实网络请求
- `npm run news:robots:mock`：用模拟 robots.txt 验证产品机器人组、通配符、最长路径、Allow 同长度优先、域内跳转、缺失文件和保守失败诊断；检查器必须注入网络客户端，未连接 API 或真实网络
- `npm run news:claim-material:check`：把两篇已获取正文拆成带来源和内容哈希的短句候选，供人工逐条核验；不自动合并相似句、不判定事实、不返回完整正文，也不调用模型、生成文案或保存平台草稿
- `npm run news:claim-selection:check`：验证人工输入主张、分别勾选原始和独立来源短句及四项人工核对后形成的只读选择计划；计划仍未接受主张、不判定事实，也不解锁文案、数据库或平台操作
- `npm run news:claim-acceptance:check`：验证逐条确认主张措辞、双来源引用和不确定性说明后形成的接受回执预览与稳定幂等键；回执不落库，因此不声称正式接受、事实核验或文案解锁
- `npm run db:claim-acceptance:store:isolated`：仅在内存 SQLite 临时表验证接受回执、主张和双来源的原子写入、幂等重放与失败回滚；没有迁移、API 接线或真实 D1 写入，测试成功不代表业务数据已保存
- `npm run db:claim-acceptance:plan`：静态检查三张回执表的生成迁移、关键唯一索引和 create-only 边界；不会检查或修改真实 D1，也没有迁移应用入口
- `npm run db:claim-acceptance:inspect:isolated`：用模拟只读 D1 响应验证回执存储的 missing、partial、verified 判定；只允许 sqlite_schema 与 PRAGMA 查询，不读取业务行、不写数据库，也未接入 API
- `npm run db:claim-acceptance:read:isolated`：在一次性内存 SQLite 中读取完整 active 人工接受回执，验证主张、审核勾选和 original/independent 双来源的只读投影；成功只表示持久人工接受可供草稿研究，仍不声称自动事实核验、文案就绪或真实 D1 已接入
- `npm run news:accepted-claim-blueprint:check`：把持久人工接受的精确主张措辞、双来源引用和不确定性说明映射为小红书/抖音图文内容结构；标题、正文、封面词、标签和来源说明仍为空，不调用模型、不生成或保存平台草稿
- `npm run news:platform-text-draft:check`：校验人工填写的双平台标题、封面词、开场、互动句和标签，并只用已接受主张、核验备注及保存来源拼接完整文案预览；包装文字尚未做语义事实核验，预览不调用模型、不写库、不保存平台草稿
- `npm run news:platform-text-review:check`：逐平台确认当前文案指纹、标题封面、开场结尾、已接受主张、来源说明、不确定性与无流量承诺，生成稳定审核回执预览；回执尚未落库，因此不解锁平台草稿交接或保存
- `npm run db:platform-text-review:store:isolated`：在一次性内存 SQLite 中验证文案审核回执的授权口令、指纹绑定、原子写入、幂等重放与失败回滚；不接触迁移、真实 D1 或平台草稿，也不代表业务落库结果
- `npm run db:platform-text-review:plan`：核验生成的双表审核回执迁移仅包含建表和建索引语句，并保持真实 D1 应用关闭；输出计划不执行 SQL、不保存平台草稿
- `npm run db:platform-text-review:inspect:isolated`：用模拟只读 D1 响应检查双表、索引和列的 missing、partial、verified 状态；不读取业务行、不写数据库、不接入 API 或平台草稿
- `npm run db:platform-text-review:read:isolated`：从一次性内存 SQLite 读取 active 审核回执及逐平台 7 项人工勾选，重新校验审核指纹并生成稳定只读投影；不解锁草稿交接、不保存或发布平台内容
- `npm run news:platform-text-handoff:plan`：把当前双平台文案与持久审核指纹绑定为官方创作页的可见浏览器交接清单；只交接精确文案，图片素材、账号确认和保存草稿仍需后续人工授权，不打开页面、不上传、不发布
- `npm run news:platform-text-assets:plan`：把已审核文案原字符拆成小红书 1080×1440（3:4）与抖音 1080×1920（9:16）的封面卡、正文卡和原样 caption 清单；最多 1 张封面加 8 张正文卡，只生成带指纹规格，不调用模型、不渲染图片、不打开或保存平台草稿
- `npm run news:platform-text-assets:render`：把通过指纹校验的信息卡规格渲染为内存中的确定性 SVG，内嵌可无损还原的审核文案和 SHA-256，并转义可执行标记；测试不写文件、不调用模型，视觉仍须人工复核后才能导出或上传
- `npm run news:platform-text-assets:export:isolated`：在一次性临时工作区验证 SVG 指纹、精确导出口令、`work/platform-text-visual-previews/` 路径边界、禁止覆盖、写后校验和失败目录保留；不导出真实业务素材，不打开创作页、不保存平台草稿
- `npm run news:platform-text-assets:inspect:isolated`：只读检查已导出 SVG 包的 manifest 指纹、固定文件集、画布尺寸、文件哈希和原文元数据；完整时只标记为“等待人工视觉审核”，不修改文件、不接受审核、不上传或保存平台草稿
- `npm run news:platform-text-assets:review:check`：把当前 SVG 包的渲染与 manifest 指纹绑定到逐平台人工视觉检查清单，并生成稳定但未保存的审核回执预览；预览不代表审核已持久化或素材已就绪，也不上传、不保存草稿
- `npm run db:platform-text-visual-review:store:isolated`：在一次性内存 SQLite 中验证视觉审核回执、双平台检查和逐素材指纹的原子写入、幂等重放与失败回滚；未创建迁移、未接入真实 D1，也不代表真实审核已保存或素材已解锁
- `npm run db:platform-text-visual-review:plan`：静态检查三张视觉审核表的生成迁移只包含建表和建索引，并注册到迁移链；不会连接或修改真实 D1，且没有迁移应用入口
- `npm run db:platform-text-visual-review:inspect:isolated`：用模拟只读 D1 响应检查视觉审核三表、索引和字段的 missing、partial、verified 状态；不读取业务行、不写数据库，也不解锁素材或平台草稿
- `npm run db:platform-text-visual-review:read:isolated`：从一次性内存 SQLite 只读重建已持久化的视觉审核回执，复核双平台检查、逐素材顺序与指纹并重算审核指纹；不写数据库、不接 API，也不解锁素材或平台草稿
- `npm run news:platform-text-assets:handoff:plan`：把当前只读 SVG 包检查与已持久化视觉审核回执绑定成双平台素材引用计划；只准备相对路径和指纹供后续单独授权，不读取或移动文件、不解锁素材、不上传或保存平台草稿
- `npm run news:platform-text-draft-package:plan`：逐级复核已审核文案交接、视觉规划、SVG 渲染和已审核素材引用的全部指纹，再组合成双平台草稿包计划；只表示具备请求打开创作页的条件，不打开页面、不上传、不保存草稿或发布
- `npm run news:platform-text-creator-open:preview`：为用户选择的小红书/抖音目标生成官方创作页、可见账号身份检查和一次性确认口令的授权预览；不读取登录态、不打开页面、不触发登录、上传、草稿保存或发布
- `npm run news:platform-text-creator-open:authorize:check`：只在执行开关、当前授权预览指纹和一次性口令全部一致时生成“仅打开可见官方创作页”的执行契约；契约禁止登录、上传、草稿保存和发布，且检查本身不打开页面
- `npm run news:platform-text-creator-open:execute:isolated`：用注入式模拟打开器验证已授权官方创作页的顺序打开、同源结果和部分失败诊断；仓库未接真实浏览器适配器或路由，不检查账号、不登录、不上传、不保存或发布
- `npm run news:platform-text-creator-account:preview`：把显式传入的可见创作页账号名称整理为逐平台人工确认预览，并绑定打开契约指纹；不读取隐藏登录态，不自动认定账号正确，不登录、不上传、不保存或发布
- `npm run news:platform-text-creator-account:confirm:check`：只在当前身份预览指纹、逐平台可见账号名称和人工确认全部一致时生成账号确认指纹；确认不授权登录、上传、草稿保存或发布，也不接入路由
- `npm run news:platform-text-creator-form-fill:preview`：把当前已审核文案、素材引用、创作页打开契约和人工确认账号绑定为“仅预填表单”的一次性授权预览；不触发浏览器交互、上传、填表、保存草稿或发布
- `npm run news:platform-text-creator-form-fill:authorize:check`：仅在一次性预填口令、当前预览指纹和明确执行意图全部一致时生成“上传已审核素材并预填已审核字段”的执行契约；契约禁止登录、保存草稿和发布，检查本身不执行任何平台动作
- `npm run news:platform-text-creator-form-fill:execute:isolated`：用注入式模拟适配器验证已授权创作页的账号仍可见、字段与素材指纹完全一致、顺序预填和部分失败诊断；仓库未接真实浏览器或路由，不登录、不保存草稿、不发布
- `npm test`：构建并运行最相关测试
- `npm run vendors:bootstrap`：下载五个开源引擎代码
- `npm run pilot:import`：幂等导入试播剧本、角色和分镜
- `npm run pilot:script-envelope`：把已人工核验的主张、引用来源和三平台目标封装为带 SHA-256 指纹的只读剧本输入；不抓取网页、不调用模型，也不生成剧本
- `npm run pilot:script-plan`：把来源锁输入映射到 LocalMiniDrama 的真实剧本生成合同，并将 LumenX 保持为等待剧本/分镜；只返回脱敏计划，执行前仍需确认模型与成本
- `bridge/script-output-acceptance.mjs`：对真实剧本输出执行只读验收，要求来源锁指纹、逐条主张使用记录、零未引用事实声明和完整人工复核项；它不解析文本语义、不自动核实事实，也不调用模型或触发下游生成
- 本机 `/api/local/script-approval` 只生成剧本模型授权预览：校验来源指纹、文本配置、人工报价、预算和明确确认；拒收密钥字段，且不提供执行器
- 操作台只提供前往 `http://127.0.0.1:3013/ai-config` 的本机配置引导；供应商密钥不在知绘操作台输入、显示或保存，配置后仍需单独完成报价与授权预览
- `npm run pilot:package`：生成三平台文案和字幕草稿
- `npm run pilot:readiness`：只读核对事实来源、三平台包、成片/音轨/字幕文件及 SHA-256；只有全部真实存在才返回 `review_pending`
- `npm run db:generate`：数据库结构变化后生成迁移
- `npm run db:preflight`：只读核对 Sites D1 绑定、审核表迁移和破坏性 SQL；不会执行迁移
- `npm run db:local:chain:plan`：把 0000–0006 源文件与本机 D1 真实结构合并核对；只输出完整应用计划，不执行 SQL
- `npm run db:local:chain:apply`：默认仍为计划模式，只输出精确确认短语和应用守卫结果；当前执行器未连接，不执行 SQL
- `npm run db:local:chain:prepare`：结合真实结构检查与隔离验证生成整链指纹；只返回标签、语句数量、类型和 SHA-256，不返回 SQL 或执行命令
- `npm run db:chain:verify:isolated`：在一次性内存 SQLite 中按顺序真实应用 0000–0006 并检查最终结构；不接触本机或线上 D1，也不代表业务结果

隔离验证按每个迁移文件开启独立事务；若某条语句失败，会回滚该文件并只报告迁移标签、语句序号、错误代码和回滚校验结果，不输出 SQL 内容，也不会继续执行后续迁移。

`npm run pilot:sync` 只复制 LocalMiniDrama 已存在的本地产物并登记 SHA-256；不会生成占位文件，重复运行不会重复登记。

## 审核审计迁移

审核历史与信源聚类结构使用 Sites 管理的 D1 `DB` 绑定。`npm run db:preflight` 只证明迁移源文件完整，因此固定输出 `sourcePlanReady: true`、`readyToApply: false`；协作者还必须运行 `npm run db:local:chain:plan` 核对真实数据库状态。只有完整计划返回 `readyForAuthorizedApply: true` 后，项目维护者才可在一次单独、明确授权的操作中按 0000–0006 顺序应用迁移。预检不会登录账号、修改数据库或发布内容；不要绕过 Sites 直接绑定个人 Cloudflare 资源。

`npm run db:local:chain:apply` 目前只是授权前守卫：不带参数运行时必定阻止应用并报告 `executorInvoked: false`、`databaseWrites: false`。传入执行参数和精确确认短语后，它只准备 `wrangler d1 migrations apply DB --local` 的结构化本机命令，不调用子进程、不执行迁移，也不会切换到远程 D1；实际运行仍需要用户另行明确授权。

迁移完成后，`/api/reviews?jobId=<任务号>` 才会返回真实审核历史；未完成时接口明确返回 503，不能把它解释为“暂无审核记录”。

指标来源字段由迁移 `0004_strange_doorman` 提供，包括平台来源类型、外部作品号、采集时间和导入时间，并用平台、作品号、采集时间的联合唯一索引阻止重复快照。迁移应用前指标接口保持只读关闭；旧记录因缺少来源证明不会被展示或用于训练。该迁移已生成但未应用。

剧本人工验收记录由迁移 `0005_jazzy_toad` 提供，只保存剧本输出指纹、来源锁指纹、7 项人工检查结果和复核时间，不保存剧本文本。相同剧本与来源锁组合由唯一索引去重；只有当前指纹匹配的 `accepted` 记录才能解除角色与分镜的规划锁，模型执行仍需独立授权。该迁移已生成并通过隔离数据库验证，但未应用到本机或线上 D1。

## 当前阻塞

- 文本、图片、视频和 TTS 服务尚未配置。
- 抖音、TikTok、小红书账号尚未授权。
- 自动发布保持关闭，直到人工审核与账号授权都完成。
