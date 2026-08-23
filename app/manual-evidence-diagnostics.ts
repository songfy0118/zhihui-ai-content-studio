const manualEvidenceBlockerLabels: Record<string, string> = {
  invalid_manual_evidence_request: "请完整填写待补证标题、来源名称、发布者身份、候选标题、公开链接和发布时间",
  search_plan_not_ready: "当前补证计划已失效，请重新生成",
  manual_evidence_input_empty: "请先填写一条公开来源",
  manual_evidence_input_limit_exceeded: "一次最多核对 3 条公开来源",
  lead_not_current: "所选标题已不在当前补证计划中",
  duplicate_lead: "同一标题本轮只能填写一条候选来源",
  source_name_invalid: "来源名称需为 2–80 个字符",
  title_invalid: "候选标题需为 8–300 个字符",
  publisher_role_invalid: "请选择原始发布者或转载页",
  public_https_url_required: "请填写无需登录的公开 HTTPS 链接",
  published_at_invalid: "发布时间必须是有效的 ISO 8601 时间",
  outside_time_window: "发布时间与原来源相差超过 7 天",
  same_exact_host: "候选链接与原来源属于同一主机",
  title_match_below_threshold: "候选标题与待补证标题关联度不足",
};

export function formatManualEvidenceBlocker(blocker: string) {
  const [prefix, index, ...reasonParts] = blocker.split(":");
  if (prefix === "manual_candidate_invalid" && /^\d+$/.test(index ?? "") && reasonParts.length > 0) {
    const reason = reasonParts.join(":");
    return `第 ${Number(index) + 1} 条：${manualEvidenceBlockerLabels[reason] ?? reason}`;
  }
  return manualEvidenceBlockerLabels[blocker] ?? blocker;
}

export function formatManualEvidencePublisherRole(role: string | null | undefined) {
  if (role === "original_publisher") return "原始发布者";
  if (role === "syndicated_or_repost") return "转载页 / 聚合页（需继续核对转载链）";
  return "发布者身份未声明";
}
