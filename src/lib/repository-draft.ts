export function repositoryReference(input: string | null): string | null {
  if (!input || input.length > 160) return null;
  const value = input.trim();
  if (!/^[a-z\d](?:[a-z\d-]{0,38})\/[a-z\d_.-]{1,100}$/i.test(value))
    return null;
  const repo = value.split("/")[1];
  if (repo === "." || repo === "..") return null;
  return `https://github.com/${value}`;
}

export function withRepositoryDraft<
  T extends { website: string; description: string },
>(draft: T, input: string | null): T {
  const url = repositoryReference(input);
  if (!url) return draft;
  return {
    ...draft,
    website: url,
    description:
      draft.description ||
      `Community project inspired by ${input}. Not affiliated with the repository maintainers.`,
  };
}
