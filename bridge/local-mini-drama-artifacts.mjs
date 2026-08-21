import { createHash } from "node:crypto";

const pilotInputs = new WeakMap();

export function getLocalMiniDramaPilotInput(engineOutputs) {
  const input = pilotInputs.get(engineOutputs);
  return input ? { ...input } : null;
}

export async function inspectLocalMiniDramaOutputs(apiBase, dramaId, fetcher = fetch) {
  const base = apiBase.replace(/\/$/, "");
  const [dramaResponse, mergesResponse] = await Promise.all([
    fetcher(`${base}/dramas/${dramaId}`),
    fetcher(`${base}/video-merges?drama_id=${encodeURIComponent(dramaId)}`),
  ]);
  const [dramaPayload, mergesPayload] = await Promise.all([dramaResponse.json(), mergesResponse.json()]);
  if (!dramaResponse.ok || dramaPayload?.success === false || !dramaPayload?.data) throw new Error("LocalMiniDrama project is unavailable");
  if (!mergesResponse.ok || mergesPayload?.success === false) throw new Error("LocalMiniDrama merge history is unavailable");

  const drama = dramaPayload.data;
  const episodes = Array.isArray(drama.episodes) ? drama.episodes : [];
  const storyboards = episodes.flatMap((episode) => Array.isArray(episode.storyboards) ? episode.storyboards : []);
  const merges = Array.isArray(mergesPayload?.data) ? mergesPayload.data : [];
  const sceneVideos = storyboards.filter((storyboard) => Boolean(storyboard.video_url));
  const storyboardsWithAudio = storyboards.filter((storyboard) => Boolean(storyboard.audio_local_path || storyboard.narration_audio_local_path));
  const audioFiles = storyboards.flatMap((storyboard) => [storyboard.audio_local_path, storyboard.narration_audio_local_path]).filter(Boolean);
  const finalVideos = episodes.filter((episode) => Boolean(episode.video_url));
  const completedMerges = merges.filter((merge) => merge.status === "completed" && merge.merged_url);
  const firstStoryboard = storyboards[0];
  let pilotCandidate = null;
  let privatePilotInput = null;
  if (firstStoryboard) {
    const pilotInput = {
      dramaId: Number(drama.id),
      episodeId: firstStoryboard.episode_id ?? episodes[0]?.id ?? null,
      storyboardId: firstStoryboard.id ?? null,
      storyboardNumber: firstStoryboard.storyboard_number ?? 1,
      title: firstStoryboard.title ?? "",
      duration: Number(firstStoryboard.duration ?? 0),
      aspectRatio: drama.metadata?.aspect_ratio ?? "9:16",
      imagePrompt: firstStoryboard.image_prompt ?? "",
      videoPrompt: firstStoryboard.video_prompt ?? "",
      narration: firstStoryboard.narration ?? "",
      dialogue: firstStoryboard.dialogue ?? "",
    };
    const inputCompleteness = {
      imagePrompt: Boolean(pilotInput.imagePrompt),
      videoPrompt: Boolean(pilotInput.videoPrompt),
      spokenText: Boolean(pilotInput.narration || pilotInput.dialogue),
      duration: pilotInput.duration > 0,
      aspectRatio: Boolean(pilotInput.aspectRatio),
    };
    pilotCandidate = {
      storyboardId: pilotInput.storyboardId,
      storyboardNumber: pilotInput.storyboardNumber,
      title: pilotInput.title,
      duration: pilotInput.duration,
      aspectRatio: pilotInput.aspectRatio,
      inputCompleteness,
      inputComplete: Object.values(inputCompleteness).every(Boolean),
      requestHash: createHash("sha256").update(JSON.stringify(pilotInput)).digest("hex"),
      promptsReturned: false,
    };
    privatePilotInput = Object.freeze({
      requestHash: pilotCandidate.requestHash,
      imagePrompt: pilotInput.imagePrompt,
      videoPrompt: pilotInput.videoPrompt,
      duration: pilotInput.duration,
      aspectRatio: pilotInput.aspectRatio,
    });
  }

  const result = {
    dramaId: Number(drama.id),
    dramaStatus: drama.status ?? "unknown",
    episodeCount: episodes.length,
    storyboardCount: storyboards.length,
    sceneVideoCount: sceneVideos.length,
    storyboardAudioReadyCount: storyboardsWithAudio.length,
    audioFileCount: new Set(audioFiles).size,
    finalVideoCount: finalVideos.length,
    completedMergeCount: completedMerges.length,
    pilotCandidate,
    candidates: {
      finalVideos: finalVideos.map((episode) => ({ episodeId: episode.id, url: episode.video_url })),
      completedMerges: completedMerges.map((merge) => ({ mergeId: merge.id, url: merge.merged_url })),
      audioFiles: [...new Set(audioFiles)],
    },
  };
  if (privatePilotInput) pilotInputs.set(result, privatePilotInput);
  return result;
}
