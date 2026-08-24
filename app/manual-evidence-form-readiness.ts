type ManualEvidenceFormInput = {
  leadId: string;
  sourceName: string;
  publisherRole: string;
  title: string;
  canonicalUrl: string;
  publishedAt: string;
};

const REQUIRED_FIELDS = [
  ["leadId", "待补证标题"],
  ["sourceName", "来源名称"],
  ["publisherRole", "发布者身份"],
  ["title", "候选标题"],
  ["canonicalUrl", "公开 HTTPS 链接"],
  ["publishedAt", "发布时间"],
] as const;

export function buildManualEvidenceFormReadiness(input: ManualEvidenceFormInput) {
  const items = REQUIRED_FIELDS.map(([id, label]) => ({ id, label, complete:Boolean(input[id].trim()) }));
  const completed = items.filter((item) => item.complete).length;
  return {
    items,
    completed,
    total:items.length,
    ready:completed === items.length,
    missingLabels:items.filter((item) => !item.complete).map((item) => item.label),
  };
}

export function describeManualEvidencePreviewReadiness(fieldsComplete: boolean, linkBlocked: boolean) {
  if (!fieldsComplete) return "缺少字段时不会发送预览请求";
  if (linkBlocked) return "字段已填齐，但本地链接校验已阻断；修正红色提示后才能预览";
  return "字段已填齐且本地链接校验通过；服务器仍会校验公开 HTTPS、同源、时间窗和标题关联";
}
