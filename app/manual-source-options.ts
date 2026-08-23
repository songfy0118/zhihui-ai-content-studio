type NewsSourceOptionInput = {
  id: string;
  name: string;
  sourceType: string;
  enabled: boolean;
  requiresLogin: boolean;
  editorialAliases?: string[];
};

export function listManualSourceNameSuggestions(sources: NewsSourceOptionInput[]) {
  return sources
    .filter((source) => source.sourceType === "manual_import" && !source.enabled && source.requiresLogin)
    .map((source) => ({
      id: source.id,
      name: source.name,
      aliases: [...(source.editorialAliases ?? [])],
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
}
