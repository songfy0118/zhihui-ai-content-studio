const evidenceReviewBlockerLabels: Record<string, string> = {
  search_plan_not_ready: "当前补证计划已失效，请重新生成",
  metadata_preview_not_current: "第二来源候选已失效，请重新预览",
  review_decisions_empty: "请先选择候选来源并完成六项判断",
  decision_missing: "尚未选择当前第二来源候选",
  candidate_not_current: "所选第二来源候选已失效，请重新选择",
  original_evidence_missing: "原始来源缺少可核对的公开链接",
  independent_host_not_confirmed: "两条来源的主机未能自动区分，需更换候选",
  same_event_confirmed: "尚未确认两条来源报道同一事件",
  source_independence_confirmed: "尚未确认第二来源具有独立采编或发布责任",
  publisher_relationship_checked: "尚未检查同集团、子品牌或合作关系",
  syndication_or_citation_chain_checked: "尚未排除转载、通稿复刻或单纯引用链",
  dates_consistent: "尚未确认发布时间与事件时间一致",
  no_material_conflict_found: "尚未确认不存在关键事实冲突",
};

export function formatEvidenceReviewBlocker(blocker: string) {
  const missingCheck = blocker.match(/^(.+):human_check_missing:([^:]+)$/);
  if (missingCheck) {
    const [, leadId, checkId] = missingCheck;
    return `线索 ${leadId}：${evidenceReviewBlockerLabels[checkId] ?? checkId}`;
  }

  const targetBlocker = blocker.match(/^(.+):(decision_missing|candidate_not_current|original_evidence_missing|independent_host_not_confirmed)$/);
  if (targetBlocker) {
    const [, leadId, reason] = targetBlocker;
    return `线索 ${leadId}：${evidenceReviewBlockerLabels[reason]}`;
  }

  if (blocker.startsWith("review_decision_invalid:")) {
    return `审查选择无效：${blocker.slice("review_decision_invalid:".length)}`;
  }
  return evidenceReviewBlockerLabels[blocker] ?? blocker;
}
