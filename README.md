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
- `npm test`：构建并运行最相关测试
- `npm run vendors:bootstrap`：下载五个开源引擎代码
- `npm run pilot:import`：幂等导入试播剧本、角色和分镜
- `npm run pilot:package`：生成三平台文案和字幕草稿
- `npm run db:generate`：数据库结构变化后生成迁移

## 当前阻塞

- 文本、图片、视频和 TTS 服务尚未配置。
- 抖音、TikTok、小红书账号尚未授权。
- 自动发布保持关闭，直到人工审核与账号授权都完成。
