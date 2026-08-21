import { NEWS_SOURCE_CATALOG } from "../bridge/news-source-catalog.mjs";
import { buildEvidenceSearchPlan } from "../bridge/evidence-search-plan.mjs";
import { buildEvidenceMetadataPreview } from "../bridge/evidence-metadata-preview.mjs";
import { buildEvidenceReviewPreview } from "../bridge/evidence-review-preview.mjs";

const plan = buildEvidenceSearchPlan([], [], NEWS_SOURCE_CATALOG);
const metadataPreview = buildEvidenceMetadataPreview(plan, []);
console.log(JSON.stringify({ ...buildEvidenceReviewPreview(plan, metadataPreview, []), externalCalls: 0 }, null, 2));
