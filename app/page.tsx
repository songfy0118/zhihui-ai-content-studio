"use client";

import { useMemo, useState } from "react";

const ideas = [
  { id: 1, score: 94, type: "动物", title: "如果章鱼去面试，它能同时握几次手？", hook: "三颗心脏、九个大脑，它可能比面试官还忙。", tag: "高完播潜力", color: "coral" },
  { id: 2, score: 91, type: "人体", title: "你的免疫细胞，正在身体里拍一部警匪片", hook: "一个伤口出现后，第一批警察只需要几分钟到场。", tag: "适合连续剧", color: "violet" },
  { id: 3, score: 88, type: "宇宙", title: "把地球压成一颗糖，会发生什么？", hook: "答案不是爆炸，而是你制造了一个微型黑洞。", tag: "画面冲击强", color: "blue" },
  { id: 4, score: 85, type: "科技", title: "AI为什么认得猫，却不一定懂什么是猫？", hook: "给它换几个像素，它可能立刻认成烤面包机。", tag: "账号定位匹配", color: "lime" },
];

const stages = ["选题", "查证", "脚本", "分镜", "配音", "剪辑", "质检", "发布"];

const script = [
  { time: "00–05s", role: "章鱼阿墨", line: "人类面试要握一次手，我来面试——是不是得握八次？", visual: "阿墨穿西装，八只触手同时伸向镜头" },
  { time: "05–18s", role: "旁白", line: "其实，章鱼每条腕足都有大量神经元，能半独立地探索和判断。", visual: "腕足变成八名忙碌的小助理，分别翻文件" },
  { time: "18–35s", role: "面试官", line: "那你是一只章鱼，还是一个九人团队？", visual: "镜头拉远，头部亮起主控灯，八条腕足各亮一盏" },
  { time: "35–54s", role: "旁白", line: "但别误会，它不是有九个真正的大脑，而是一个中央脑加高度发达的神经系统。", visual: "错误说法被红笔划掉，切换为科学结构图" },
  { time: "54–65s", role: "章鱼阿墨", line: "所以这份工作，一个人的工资，九个人的效率，成交？", visual: "面试官沉默，屏幕出现关注提示" },
];

export default function Home() {
  const [selected, setSelected] = useState(1);
  const [done, setDone] = useState(["选题", "查证"]);
  const [filter, setFilter] = useState("全部");
  const [copied, setCopied] = useState(false);
  const current = ideas.find((item) => item.id === selected) ?? ideas[0];
  const visibleIdeas = useMemo(() => filter === "全部" ? ideas : ideas.filter((item) => item.type === filter), [filter]);

  const toggleStage = (stage: string) => {
    setDone((items) => items.includes(stage) ? items.filter((item) => item !== stage) : [...items, stage]);
  };

  const copyPrompt = async () => {
    const text = `请制作一条65秒竖屏AI科普漫剧。标题：${current.title}\n开场钩子：${current.hook}\n要求：固定角色章鱼阿墨，画面统一，事实可核验，结尾提出互动问题。`;
    await navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="知绘工厂首页">
          <span className="brandMark">知</span>
          <span><strong>知绘工厂</strong><small>AI SCIENCE STUDIO</small></span>
        </a>
        <nav aria-label="主导航">
          <a className="active" href="#today">今日生产</a>
          <a href="#ideas">选题池</a>
          <a href="#workflow">工作流</a>
          <a href="#strategy">账号基调</a>
        </nav>
        <div className="dayBadge"><span>连续生产</span><strong>07 天</strong></div>
      </header>

      <section className="hero" id="top">
        <div className="heroCopy">
          <p className="eyebrow"><span>●</span> ONE-PERSON CONTENT FACTORY</p>
          <h1>今天不找灵感。<br/><em>今天完成一条。</em></h1>
          <p className="lede">把硬知识讲成有角色、有冲突、有记忆点的 AI 科普漫剧。一个人，也能稳定运营一条原创内容流水线。</p>
          <div className="heroActions">
            <a className="primaryButton" href="#today">开始今日生产 <b>→</b></a>
            <button className="textButton" onClick={copyPrompt}>{copied ? "已复制制作提示词 ✓" : "复制今日制作提示词"}</button>
          </div>
        </div>
        <aside className="positionCard" id="strategy">
          <div className="cardLabel">账号唯一基调</div>
          <div className="character">墨</div>
          <h2>科学很硬，故事要软。</h2>
          <p>固定角色「章鱼阿墨」误闯科学世界，每集用一个生活冲突解释一个可靠知识点。</p>
          <div className="positionMeta"><span>45–75 秒</span><span>日更 1 条</span><span>9:16 竖屏</span></div>
        </aside>
      </section>

      <section className="production" id="today">
        <div className="sectionHeading">
          <div><p className="sectionIndex">01 / TODAY</p><h2>今日生产台</h2></div>
          <div className="progressText"><strong>{done.length}/8</strong><span>流程完成</span></div>
        </div>
        <div className="pipeline" id="workflow">
          {stages.map((stage, index) => (
            <button key={stage} className={done.includes(stage) ? "stage done" : "stage"} onClick={() => toggleStage(stage)}>
              <span>{done.includes(stage) ? "✓" : String(index + 1).padStart(2, "0")}</span>{stage}
            </button>
          ))}
        </div>

        <div className="workGrid">
          <article className="briefCard">
            <div className="score"><b>{current.score}</b><span>选题分</span></div>
            <p className="miniLabel">TODAY'S EPISODE · {current.type}</p>
            <h3>{current.title}</h3>
            <blockquote>“{current.hook}”</blockquote>
            <div className="facts">
              <div><span>核心事实</span><p>章鱼约有三分之二的神经元分布在腕足中，但“九个大脑”是通俗比喻，脚本必须纠正。</p></div>
              <div><span>视觉母题</span><p>办公室面试 × 八名腕足助理 × 神经系统控制室</p></div>
            </div>
            <button className="primaryButton full" onClick={copyPrompt}>{copied ? "提示词已复制 ✓" : "复制完整制作提示词"}</button>
          </article>

          <article className="scriptCard">
            <div className="scriptHeader"><div><p className="miniLabel">SCRIPT V1</p><h3>65秒分镜脚本</h3></div><span className="status">待事实复核</span></div>
            <div className="scriptRows">
              {script.map((row) => (
                <div className="scriptRow" key={row.time}>
                  <time>{row.time}</time>
                  <div><b>{row.role}</b><p>{row.line}</p><small>画面：{row.visual}</small></div>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="ideaSection" id="ideas">
        <div className="sectionHeading">
          <div><p className="sectionIndex">02 / IDEA BANK</p><h2>已评分选题池</h2></div>
          <div className="filters">{["全部", "动物", "人体", "宇宙", "科技"].map((item) => <button className={filter === item ? "selected" : ""} key={item} onClick={() => setFilter(item)}>{item}</button>)}</div>
        </div>
        <div className="ideaGrid">
          {visibleIdeas.map((idea) => (
            <button className={`ideaCard ${idea.color} ${selected === idea.id ? "chosen" : ""}`} key={idea.id} onClick={() => setSelected(idea.id)}>
              <div className="ideaTop"><span>{idea.type}</span><b>{idea.score}</b></div>
              <h3>{idea.title}</h3>
              <p>{idea.hook}</p>
              <footer><span>{idea.tag}</span><i>选择 →</i></footer>
            </button>
          ))}
        </div>
      </section>

      <section className="rules">
        <div><p className="sectionIndex">03 / NON-NEGOTIABLES</p><h2>四条生产红线</h2></div>
        <ol>
          <li><b>01</b><span><strong>不搬运切片</strong>原创角色、原创脚本、可授权素材。</span></li>
          <li><b>02</b><span><strong>不让 AI 当信源</strong>每个知识点至少查两处可靠资料。</span></li>
          <li><b>03</b><span><strong>不伪装真人</strong>AI画面、配音和数字人全部主动标识。</span></li>
          <li><b>04</b><span><strong>不同时做五个赛道</strong>先连续发布30条，再依据数据扩题。</span></li>
        </ol>
      </section>

      <footer className="siteFooter"><strong>知绘工厂</strong><span>目标：30天完成30条原创科普漫剧</span><span>下一复盘节点：第 14 条</span></footer>
    </main>
  );
}
