"use client";

import { useEffect, useMemo, useState } from "react";

type Idea = { id:string; title:string; angle:string; category:string; status:string; douyinScore:number; tiktokScore:number; xhsScore:number; selected:boolean };
type Account = { platform:string; handle:string|null; status:string; publishMode:string };
type Job = { id:string; ideaId:string; stage:string; progress:number; status:string; platforms:string };
type Metric = { platform:string; views:number; likes:number; comments:number; shares:number; saves:number; completionRate:number };

const platformMeta = {
  douyin: { name:"抖音", region:"中国", color:"#ff4e45" },
  tiktok: { name:"TikTok", region:"美国", color:"#51e7dd" },
  xiaohongshu: { name:"小红书", region:"中国", color:"#ff2442" },
};

const fallbackIdeas: Idea[] = [
  ["octopus","如果章鱼去面试，它能同时握几次手？","三颗心脏、分布式神经系统，用办公室喜剧纠正九个大脑的误解","动物",94,87,92],
  ["immune","你的免疫细胞，正在身体里拍警匪片","把伤口后的免疫反应讲成一次紧急出警","人体",91,84,94],
  ["earth-candy","把地球压成一颗糖，会发生什么？","用极端尺度解释黑洞与史瓦西半径","宇宙",88,91,86],
  ["ai-cat","AI认得猫，为什么不一定懂猫？","用对抗样本解释识别与理解的区别","科技",85,93,89],
  ["crow","乌鸦为什么会记仇？","让阿墨误惹一只可以记住人脸的乌鸦","动物",92,89,95],
  ["sleep","熬夜后，大脑真的会吃掉自己吗？","从夸张标题切入，解释胶质细胞与睡眠","人体",90,86,96],
  ["moon","月球正在偷偷离开地球","把每年约3.8厘米的距离变化变成离家故事","宇宙",87,94,90],
  ["robot","机器人为什么突然都学会走路了？","从强化学习、仿真训练到现实迁移","科技",86,95,88],
  ["whale","鲸鱼为什么不会被自己的体重压扁？","海水浮力与搁浅风险的反差","动物",93,90,94],
  ["memory","你的记忆每次回想都会被改写","把记忆再巩固讲成一份反复修改的文档","人体",89,88,97],
].map(([id,title,angle,category,douyinScore,tiktokScore,xhsScore]) => ({ id:String(id), title:String(title), angle:String(angle), category:String(category), status:"candidate", douyinScore:Number(douyinScore), tiktokScore:Number(tiktokScore), xhsScore:Number(xhsScore), selected:false }));

const engineRows = [
  { name:"LumenX", role:"漫剧主引擎", state:"代码已就绪", detail:"剧本 → 角色 → 分镜 → 视频" },
  { name:"LocalMiniDrama", role:"本机轻量主引擎", state:"本机已运行", detail:"SQLite 本地项目与画布", url:"http://127.0.0.1:3013" },
  { name:"MoneyPrinterTurbo", role:"资讯成片", state:"代码已就绪", detail:"文案、图库、配音、字幕" },
  { name:"CosyVoice", role:"中文配音", state:"待下载模型", detail:"固定旁白与角色音色" },
  { name:"MuseTalk", role:"数字人口型", state:"按需启用", detail:"只用于数字人备选路线" },
];

export default function Home() {
  const [ideas, setIdeas] = useState<Idea[]>(fallbackIdeas);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [platforms, setPlatforms] = useState(["douyin", "tiktok", "xiaohongshu"]);
  const [view, setView] = useState("ideas");
  const [message, setMessage] = useState("正在载入你的内容工厂…");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [i,a,j,m] = await Promise.all([fetch("/api/ideas"), fetch("/api/accounts"), fetch("/api/jobs"), fetch("/api/metrics")]);
      if (![i,a,j,m].every((response) => response.ok)) throw new Error("数据服务尚未初始化");
      setIdeas((await i.json()).ideas); setAccounts((await a.json()).accounts); setJobs((await j.json()).jobs); setMetrics((await m.json()).metrics);
      setMessage("准备就绪：先从10个候选中选出最多3个。 ");
    } catch { setMessage("当前使用本机候选池；私有线上版会自动保存选择与数据。"); }
  };
  useEffect(() => { load(); }, []);

  const selected = ideas.filter((idea) => idea.selected);
  const totalViews = metrics.reduce((sum, item) => sum + item.views, 0);
  const avgCompletion = metrics.length ? Math.round(metrics.reduce((sum, item) => sum + item.completionRate, 0) / metrics.length) : 0;
  const platformAverages = useMemo(() => Object.keys(platformMeta).map((key) => {
    const rows = metrics.filter((metric) => metric.platform === key);
    return { key, views: rows.length ? Math.round(rows.reduce((sum,row)=>sum+row.views,0)/rows.length) : 0 };
  }), [metrics]);

  const toggleIdea = async (idea: Idea) => {
    if (!idea.selected && selected.length >= 3) { setMessage("一次最多选择3个，先取消一个再选。"); return; }
    const next = !idea.selected;
    setIdeas((rows) => rows.map((row) => row.id === idea.id ? { ...row, selected: next } : row));
    const response = await fetch("/api/ideas", { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ id:idea.id, selected:next }) });
    if (!response.ok) setMessage("当前为本地预览，选择已在页面保留但尚未写入云端。");
  };

  const queueGeneration = async () => {
    if (!selected.length) { setMessage("请先选择至少1个选题。"); return; }
    if (!platforms.length) { setMessage("请至少选择1个平台版本。"); return; }
    setBusy(true); setMessage("正在创建中英文脚本、三平台包装与分镜任务…");
    const response = await fetch("/api/jobs", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ ideaIds:selected.map((i)=>i.id), platforms }) });
    setBusy(false);
    if (response.ok) { setMessage(`已创建 ${selected.length} 个内容任务。下一步配置模型密钥后即可生成实际素材。`); await load(); setView("production"); }
    else setMessage("任务未写入：线上数据服务可能仍在初始化。");
  };

  const togglePlatform = (key:string) => setPlatforms((rows) => rows.includes(key) ? rows.filter((row)=>row!==key) : [...rows,key]);

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><span>知</span><div><b>知绘工厂</b><small>CONTENT OS</small></div></div>
      <nav>
        {[ ["ideas","今日选题","10"], ["production","生成队列",String(jobs.length)], ["review","审核发布",jobs.length ? "!" : "0"], ["metrics","数据学习",String(metrics.length)], ["accounts","账号与引擎","5"] ].map(([id,label,count]) =>
          <button key={id} className={view===id?"active":""} onClick={()=>setView(id)}><i>{label}</i><span>{count}</span></button>)}
      </nav>
      <div className="sidebarFoot"><span className="pulse"/> 本地桥接待配置<small>RTX 4060 · 8GB VRAM</small></div>
    </aside>

    <section className="workspace">
      <header className="topbar"><div><p>AI SCIENCE CONTENT FACTORY</p><h1>{view==="ideas"?"今天做什么？":view==="production"?"生成到哪了？":view==="review"?"最后把关":view==="metrics"?"让数据教会系统":"把工具接起来"}</h1></div><div className="today"><span>第 01 天</span><b>目标 30 条</b></div></header>
      <div className="notice"><span>●</span>{message}</div>

      {view === "ideas" && <>
        <section className="controlStrip">
          <div><small>01</small><b>选择平台版本</b></div>
          <div className="platformToggles">{Object.entries(platformMeta).map(([key,p])=><button key={key} className={platforms.includes(key)?"on":""} onClick={()=>togglePlatform(key)} style={{"--platform":p.color} as React.CSSProperties}><span/>{p.name}<small>{p.region}</small></button>)}</div>
          <div className="selectionCount"><strong>{selected.length}</strong><span>/ 3 已选择</span></div>
          <button className="generate" disabled={busy} onClick={queueGeneration}>{busy?"创建中…":"生成所选内容 →"}</button>
        </section>
        <div className="ideaHeader"><div><b>系统推荐 10 个候选</b><span>评分不是承诺播放量，而是结合题材、钩子、画面性与平台适配度的相对排序。</span></div><div className="legend"><i className="dy"/>抖音 <i className="tk"/>TikTok <i className="xhs"/>小红书</div></div>
        <section className="ideasGrid">{ideas.map((idea,index)=><article key={idea.id} className={idea.selected?"idea selected":"idea"} onClick={()=>toggleIdea(idea)}>
          <div className="ideaIndex">{String(index+1).padStart(2,"0")}<button aria-label={idea.selected?"取消选择":"选择"}>{idea.selected?"✓":"+"}</button></div>
          <span className="category">{idea.category}</span><h2>{idea.title}</h2><p>{idea.angle}</p>
          <div className="scores"><div><span>抖音</span><b>{idea.douyinScore}</b></div><div><span>TikTok</span><b>{idea.tiktokScore}</b></div><div><span>小红书</span><b>{idea.xhsScore}</b></div></div>
          <footer><span>{idea.status === "generating" ? "已进入生成队列" : idea.selected ? "已入选" : "点击选择"}</span><b>平均 {Math.round((idea.douyinScore+idea.tiktokScore+idea.xhsScore)/3)}</b></footer>
        </article>)}</section>
      </>}

      {view === "production" && <section className="panel">
        <div className="panelTitle"><div><small>02 / PRODUCTION</small><h2>生成队列</h2></div><button onClick={()=>setView("ideas")}>＋ 添加选题</button></div>
        {jobs.length ? <div className="jobList">{jobs.map((job,index)=><div className="job" key={job.id}><strong>{String(index+1).padStart(2,"0")}</strong><div><b>{ideas.find(i=>i.id===job.ideaId)?.title ?? job.ideaId}</b><span>{job.platforms.split(",").map(p=>platformMeta[p as keyof typeof platformMeta]?.name).join(" · ")}</span></div><div className="jobStage">{job.stage}<span><i style={{width:`${Math.max(job.progress,8)}%`}}/></span></div><em>{job.status === "queued" ? "等待模型配置" : job.status}</em></div>)}</div> : <div className="empty"><b>还没有生成任务</b><p>回到今日选题，选择1–3个题目后创建任务。</p></div>}
        <div className="productionSteps">{["中英文脚本","事实核验","角色与分镜","配音与字幕","三平台包装","人工审核"].map((x,i)=><div key={x}><span>{i+1}</span><b>{x}</b><small>{i===0?"同一事实，不同钩子":i===4?"标题、封面、比例分别生成":"完成后进入下一步"}</small></div>)}</div>
      </section>}

      {view === "review" && <section className="panel"><div className="panelTitle"><div><small>03 / HUMAN GATE</small><h2>没有你的确认，不会发布</h2></div></div><div className="reviewCard"><div className="mockVideo"><span>9:16</span><b>预览区</b><small>生成成片后显示</small></div><div className="checklist"><h3>发布前检查</h3>{["事实与数字已核对","画面不存在明显AI错误","配音和字幕无错字","AI内容标识已开启","音乐与素材允许商用","三个平台标题分别检查"].map(x=><label key={x}><input type="checkbox"/>{x}</label>)}<button disabled>三个账号尚未授权</button></div></div></section>}

      {view === "metrics" && <section className="panel"><div className="panelTitle"><div><small>04 / LEARNING LOOP</small><h2>账号专属评分器</h2></div></div><div className="metricCards"><div><span>已收集播放</span><b>{totalViews.toLocaleString()}</b></div><div><span>平均完播率</span><b>{avgCompletion}%</b></div><div><span>有效样本</span><b>{metrics.length}</b></div><div><span>可训练阈值</span><b>30 条</b></div></div><div className="learningGrid"><div><h3>三平台平均播放</h3>{platformAverages.map(row=><div className="bar" key={row.key}><span>{platformMeta[row.key as keyof typeof platformMeta].name}</span><i><b style={{width:`${Math.min(100,row.views/100)}%`}}/></i><strong>{row.views || "待积累"}</strong></div>)}</div><div className="formula"><h3>相对潜力分怎么来</h3><p><b>35%</b> 前5秒留存</p><p><b>25%</b> 完播率</p><p><b>20%</b> 收藏与分享</p><p><b>10%</b> 关注转化</p><p><b>10%</b> 单条制作成本</p><small>30条以前使用规则评分；30条以后按你自己的真实数据校准，不伪造具体播放量。</small></div></div></section>}

      {view === "accounts" && <section className="panel"><div className="panelTitle"><div><small>05 / CONNECTIONS</small><h2>账号与生成引擎</h2></div></div><h3 className="subhead">发布账号</h3><div className="accountGrid">{accounts.map(account=>{const p=platformMeta[account.platform as keyof typeof platformMeta];return <div className="account" key={account.platform}><span style={{background:p?.color}}>{p?.name.slice(0,1)}</span><div><b>{p?.name}</b><small>{account.publishMode}</small></div><em>{account.status==="connected"?account.handle:"需要本人授权"}</em><button disabled>准备授权</button></div>})}</div><h3 className="subhead">电脑上的开源引擎</h3><div className="engineList">{engineRows.map(row=><div key={row.name}><span className={row.state.includes("已")?"ready":"waiting"}/><b>{row.name}</b><small>{row.role}</small><p>{row.detail}</p>{"url" in row?<a href={row.url} target="_blank">打开本机工具</a>:<em>{row.state}</em>}</div>)}</div><div className="credentials"><b>还需要你提供什么？</b><p>至少选择一个文本/图片/视频服务商的API Key；创建抖音开放平台应用和TikTok开发者应用；小红书使用官方分享流程。密钥只写入受保护的运行环境，不放进网页或Git。</p></div></section>}
    </section>
  </main>;
}
