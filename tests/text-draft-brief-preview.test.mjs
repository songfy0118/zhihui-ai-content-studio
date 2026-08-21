import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildTextDraftBriefPreview } from "../bridge/text-draft-brief-preview.mjs";

const readResult = {
  status: "source_lock_read_ready",
  found: true,
  readFingerprint: "c".repeat(64),
  record: {
    id: "source-lock-one",
    leadId: "cluster:one",
    title: "OpenAI launches enterprise agent platform",
    reviewFingerprint: "a".repeat(64),
    savePlanFingerprint: "b".repeat(64),
    status: "active",
    createdAt: "2026-08-21T16:00:00.000Z",
    updatedAt: "2026-08-21T16:00:00.000Z",
    evidence: [
      { evidenceId: "b-match", sourceId: "source-b", sourceName: "Independent", title: "Enterprise agent platform launched by OpenAI", canonicalUrl: "https://b.example/story", publishedAt: "2026-08-20T14:00:00.000Z", evidenceRole: "independent" },
      { evidenceId: "a-one", sourceId: "source-a", sourceName: "Original", title: "OpenAI launches enterprise agent platform", canonicalUrl: "https://a.example/story", publishedAt: "2026-08-20T12:00:00.000Z", evidenceRole: "original" },
    ],
  },
};

const angle = "企业 AI Agent 平台会怎样改变普通开发团队的工作方式？";

test("builds a fingerprinted two-platform research brief from a complete source-lock read", () => {
  const preview = buildTextDraftBriefPreview(readResult, { editorialAngle: angle });
  assert.equal(preview.status, "text_draft_brief_preview_ready");
  assert.equal(preview.readyForHumanResearch, true);
  assert.match(preview.briefFingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(preview.brief.targets, ["xiaohongshu", "douyin"]);
  assert.equal(preview.brief.evidence.length, 2);
  assert.equal(preview.brief.angleOrigin, "human_provided");
  assert.ok(preview.brief.researchTasks.length >= 5);
  assert.deepEqual(Object.keys(preview.brief.requestedPlatformFields), ["xiaohongshu", "douyin"]);
});

test("keeps the preview deterministic and binds changes to a new fingerprint", () => {
  const first = buildTextDraftBriefPreview(readResult, { editorialAngle: angle });
  const repeat = buildTextDraftBriefPreview(structuredClone(readResult), { editorialAngle: angle });
  const reordered = structuredClone(readResult);
  reordered.record.evidence.reverse();
  const reorderedInput = buildTextDraftBriefPreview(reordered, { editorialAngle: angle, targets: ["douyin", "xiaohongshu"] });
  const changedAngle = buildTextDraftBriefPreview(readResult, { editorialAngle: `${angle} 先看风险。` });
  const changedTargets = buildTextDraftBriefPreview(readResult, { editorialAngle: angle, targets: ["xiaohongshu"] });
  assert.equal(first.briefFingerprint, repeat.briefFingerprint);
  assert.equal(first.briefFingerprint, reorderedInput.briefFingerprint);
  assert.notEqual(first.briefFingerprint, changedAngle.briefFingerprint);
  assert.notEqual(first.briefFingerprint, changedTargets.briefFingerprint);
});

test("fails closed on missing human angle, unsupported targets and tampered evidence", () => {
  assert.ok(buildTextDraftBriefPreview(readResult).blockers.includes("editorial_angle_required"));
  assert.ok(buildTextDraftBriefPreview(readResult, { editorialAngle: angle, targets: ["tiktok"] }).blockers.includes("target_platform_unsupported"));
  const tampered = structuredClone(readResult);
  tampered.record.evidence[1].evidenceRole = "independent";
  const blocked = buildTextDraftBriefPreview(tampered, { editorialAngle: angle });
  assert.ok(blocked.blockers.includes("source_lock_evidence_invalid"));
  assert.equal(blocked.brief, null);
});

test("does not invent claims, draft copy, model output or publication readiness", async () => {
  const preview = buildTextDraftBriefPreview(readResult, { editorialAngle: angle });
  assert.deepEqual(preview.factualClaims, []);
  assert.deepEqual(preview.platformDrafts, { xiaohongshu: null, douyin: null });
  assert.equal(preview.sourceBodiesFetched, false);
  assert.equal(preview.factsVerified, false);
  assert.equal(preview.readyForCopyGeneration, false);
  assert.equal(preview.draftGenerated, false);
  assert.equal(preview.modelCalls, 0);
  assert.equal(preview.externalCalls, false);
  assert.equal(preview.publishTriggered, false);

  const routes = await Promise.all([
    readFile(new URL("../app/api/news/source-lock-save-plan/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
  ]);
  assert.ok(routes.every((route) => !route.includes("text-draft-brief-preview")));
});
