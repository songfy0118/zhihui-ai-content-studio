import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildClaimReviewMaterialPreview } from "../bridge/claim-review-material-preview.mjs";
import { buildTextDraftBriefPreview } from "../bridge/text-draft-brief-preview.mjs";

function textHash(text) {
  return createHash("sha256").update(text).digest("hex");
}

function briefPreview() {
  return buildTextDraftBriefPreview({
    status: "source_lock_read_ready",
    found: true,
    readFingerprint: "a".repeat(64),
    record: {
      id: "lock-one",
      leadId: "lead-one",
      title: "Synthetic agent platform topic",
      status: "active",
      savePlanFingerprint: "b".repeat(64),
      reviewFingerprint: "c".repeat(64),
      evidence: [
        { evidenceId: "original-one", sourceId: "official-source", sourceName: "Official Source", title: "Synthetic official release", canonicalUrl: "https://official.example/release", publishedAt: "2026-08-20T12:00:00.000Z", evidenceRole: "original" },
        { evidenceId: "independent-one", sourceId: "independent-source", sourceName: "Independent Source", title: "Synthetic independent report", canonicalUrl: "https://independent.example/report", publishedAt: "2026-08-20T14:00:00.000Z", evidenceRole: "independent" },
      ],
    },
  }, { editorialAngle: "哪些已确认变化值得普通读者关注？" });
}

function acquisitionResult() {
  const documents = [
    {
      evidenceId: "original-one",
      sourceId: "official-source",
      evidenceRole: "original",
      canonicalUrl: "https://official.example/release",
      text: "The official synthetic release states that the test platform will open in three regions. This sentence contains a fictional date and number that a human editor must verify before use. A further synthetic paragraph supplies context but does not become a verified fact automatically.",
      ephemeral: true,
    },
    {
      evidenceId: "independent-one",
      sourceId: "independent-source",
      evidenceRole: "independent",
      canonicalUrl: "https://independent.example/report",
      text: "The independent synthetic report describes the same fictional launch from a separate perspective. Its wording is only source material and must not be treated as confirmation without human review. Another sentence explains that all names, numbers and events in this fixture are invented for testing.",
      ephemeral: true,
    },
  ].map((document) => ({ ...document, textHash: textHash(document.text) }));
  return {
    status: "public_article_acquisition_complete",
    sourceBodiesFetched: true,
    documents,
  };
}

test("builds deterministic, source-linked sentence candidates for human review", () => {
  const brief = briefPreview();
  const acquisition = acquisitionResult();
  const preview = buildClaimReviewMaterialPreview(acquisition, brief);
  const reordered = buildClaimReviewMaterialPreview({ ...acquisition, documents: [...acquisition.documents].reverse() }, brief);

  assert.equal(preview.status, "claim_review_material_preview_ready");
  assert.equal(preview.readyForHumanClaimReview, true);
  assert.match(preview.candidateMaterialFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(preview.candidateMaterialFingerprint, reordered.candidateMaterialFingerprint);
  assert.deepEqual(preview.sourceMaterials.map((material) => material.evidenceRole), ["original", "independent"]);
  assert.ok(preview.sourceMaterials.every((material) => material.candidates.length > 0 && material.candidates.length <= 5));
  assert.ok(preview.sourceMaterials.flatMap((material) => material.candidates).every((candidate) => candidate.status === "unreviewed_source_sentence" && candidate.text.length <= 240));
  assert.ok(!Object.hasOwn(preview, "documents"));
  assert.ok(!JSON.stringify(preview).includes(acquisition.documents[0].text));
});

test("changes the material fingerprint when valid source text changes", () => {
  const first = acquisitionResult();
  const changedText = `${first.documents[0].text} One more synthetic sentence is added for the fingerprint check.`;
  const changed = {
    ...first,
    documents: [{ ...first.documents[0], text: changedText, textHash: textHash(changedText) }, first.documents[1]],
  };
  const brief = briefPreview();
  assert.notEqual(
    buildClaimReviewMaterialPreview(first, brief).candidateMaterialFingerprint,
    buildClaimReviewMaterialPreview(changed, brief).candidateMaterialFingerprint,
  );
});

test("fails closed for incomplete, tampered or mismatched source material", () => {
  const brief = briefPreview();
  const acquisition = acquisitionResult();
  const incomplete = buildClaimReviewMaterialPreview({ ...acquisition, documents: acquisition.documents.slice(0, 1) }, brief);
  const tampered = buildClaimReviewMaterialPreview({
    ...acquisition,
    documents: [{ ...acquisition.documents[0], text: `${acquisition.documents[0].text} tampered` }, acquisition.documents[1]],
  }, brief);
  const mismatched = buildClaimReviewMaterialPreview({
    ...acquisition,
    documents: [{ ...acquisition.documents[0], canonicalUrl: "https://official.example/other" }, acquisition.documents[1]],
  }, brief);

  assert.ok(incomplete.blockers.includes("public_article_documents_invalid"));
  assert.ok(tampered.blockers.includes("public_article_document_invalid:official-source"));
  assert.ok(mismatched.blockers.includes("public_article_brief_mapping_mismatch:official-source"));
  assert.ok([incomplete, tampered, mismatched].every((result) => result.readyForHumanClaimReview === false && result.candidateMaterialFingerprint === null));
});

test("keeps every downstream action off and remains disconnected from API routes", async () => {
  const preview = buildClaimReviewMaterialPreview(acquisitionResult(), briefPreview());
  assert.equal(preview.factsVerified, false);
  assert.equal(preview.claimsAccepted, 0);
  assert.equal(preview.readyForCopyGeneration, false);
  assert.equal(preview.draftGenerated, false);
  assert.equal(preview.draftSaved, false);
  assert.equal(preview.modelCalls, 0);
  assert.equal(preview.databaseWrites, false);
  assert.equal(preview.externalCalls, 0);
  assert.equal(preview.publishTriggered, false);
  assert.equal(preview.sourceBodiesPersisted, false);
  assert.equal(preview.rawArticleTextReturned, false);

  const routes = await Promise.all([
    readFile(new URL("../app/api/news/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local/social-draft-handoff/route.ts", import.meta.url), "utf8"),
  ]);
  assert.ok(routes.every((route) => !route.includes("claim-review-material-preview")));
});
