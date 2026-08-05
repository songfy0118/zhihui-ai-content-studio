import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const apiBase = process.env.LOCAL_MINI_DRAMA_API ?? "http://127.0.0.1:5679/api/v1";
const inputPath = resolve(process.argv[2] ?? "examples/octopus-pilot.json");
const pilot = JSON.parse(await readFile(inputPath, "utf8"));

async function request(path, init = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const payload = await response.json();
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error?.message ?? `${path} returned ${response.status}`);
  }
  return payload?.data ?? payload;
}

const put = (path, body) => request(path, { method: "PUT", body: JSON.stringify(body) });
const post = (path, body) => request(path, { method: "POST", body: JSON.stringify(body) });

await put(`/dramas/${pilot.drama_id}/outline`, pilot.outline);
await put(`/dramas/${pilot.drama_id}/episodes`, { episodes: pilot.episodes });

let drama = await request(`/dramas/${pilot.drama_id}`);
const episode = drama.episodes.find((item) => item.episode_number === pilot.episodes[0].episode_number);
if (!episode) throw new Error("Imported episode was not found");

await put(`/dramas/${pilot.drama_id}/characters`, {
  episode_id: episode.id,
  characters: pilot.characters,
});

drama = await request(`/dramas/${pilot.drama_id}`);
const characterIds = new Map(drama.characters.map((character) => [character.name, character.id]));
const storyboardPayload = await request(`/episodes/${episode.id}/storyboards`);
const existing = Array.isArray(storyboardPayload) ? storyboardPayload : (storyboardPayload.storyboards ?? []);

for (const item of pilot.storyboards) {
  const previous = existing.find((row) => row.storyboard_number === item.storyboard_number);
  const body = {
    ...item,
    episode_id: episode.id,
    character_ids: item.character_names.map((name) => characterIds.get(name)).filter(Boolean),
  };
  delete body.character_names;
  const storyboard = previous ?? await post("/storyboards", body);
  await put(`/storyboards/${storyboard.id}`, body);
}

const result = await request(`/dramas/${pilot.drama_id}`);
console.log(JSON.stringify({
  drama_id: result.id,
  title: result.title,
  episodes: result.episodes.length,
  characters: result.characters.length,
  storyboards: result.episodes.reduce((sum, item) => sum + item.storyboards.length, 0),
  fact_review: result.metadata?.fact_review?.status ?? "missing",
}, null, 2));
