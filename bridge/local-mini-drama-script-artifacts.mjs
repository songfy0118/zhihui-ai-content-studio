import { createHash } from "node:crypto";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function discoverLocalMiniDramaScriptArtifacts(payload = {}) {
  const items = Array.isArray(payload?.data?.items)
    ? payload.data.items
    : Array.isArray(payload?.items)
      ? payload.items
      : [];
  const projects = items
    .filter((item) => item?.metadata?.source === "zhihui-content-os")
    .map((item) => {
      const episodes = Array.isArray(item.episodes) ? item.episodes : [];
      const scriptEpisodes = episodes.filter((episode) => normalizeText(episode?.script_content));
      const outputFingerprint = scriptEpisodes.length > 0
        ? createHash("sha256").update(JSON.stringify(scriptEpisodes.map((episode) => ({
            episodeId: Number(episode.id),
            scriptContent: normalizeText(episode.script_content),
          })))).digest("hex")
        : null;
      const sourceLockFingerprint = normalizeText(item.metadata?.source_lock_fingerprint) || null;
      return {
        dramaId: Number(item.id),
        sourceIdeaId: normalizeText(item.metadata?.source_idea_id) || null,
        dramaStatus: normalizeText(item.status) || "unknown",
        episodeCount: episodes.length,
        scriptEpisodeCount: scriptEpisodes.length,
        scriptOutputPresent: scriptEpisodes.length > 0,
        outputFingerprint,
        fingerprintAlgorithm: outputFingerprint ? "sha256" : null,
        fingerprintScope: outputFingerprint ? "episode_id_and_script_content" : null,
        sourceLockFingerprint,
        sourceLockProvenancePresent: Boolean(sourceLockFingerprint),
        metadataFactReviewPresent: Boolean(item.metadata?.fact_review),
        updatedAt: normalizeText(item.updated_at) || null,
      };
    });
  const scriptProjectCount = projects.filter((project) => project.scriptOutputPresent).length;

  return {
    status: scriptProjectCount > 0 ? "script_outputs_discovered" : "awaiting_script_output",
    scriptOutputPresent: scriptProjectCount > 0,
    projectCount: projects.length,
    scriptProjectCount,
    projects,
    discoverySource: "localminidrama:/api/v1/dramas",
    scriptContentsReturned: false,
    semanticVerification: "not_run",
    automatedFactVerification: false,
    localReadCalls: 0,
    externalCalls: false,
    databaseWrites: false,
    modelCalls: 0,
    costIncurred: false,
    generatedMedia: false,
    publishTriggered: false,
    businessResult: false,
  };
}
