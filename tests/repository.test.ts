import { test } from "node:test";
import assert from "node:assert/strict";
import {
  repositoryReference,
  withRepositoryDraft,
} from "../src/lib/repository-draft.js";
import { networks, launchpads } from "../src/ecosystem-catalog.js";
test("repository references only allow canonical owner/name links", () => {
  assert.equal(
    repositoryReference("elizaOS/eliza"),
    "https://github.com/elizaOS/eliza",
  );
  for (const value of [
    null,
    "https://evil.example/r",
    "a/../b",
    "a/..",
    "a/.",
    "owner/repo?x=1",
    "owner/repo#x",
    "owner/repo/more",
  ])
    assert.equal(repositoryReference(value), null);
});
test("repository draft preserves original name, artwork and user description", () => {
  const draft = {
    name: "My community",
    symbol: "MINE",
    logo: "https://example.com/my.png",
    website: "",
    description: "My own description",
  };
  const next = withRepositoryDraft(draft, "elizaOS/eliza");
  assert.equal(next.website, "https://github.com/elizaOS/eliza");
  assert.equal(next.name, draft.name);
  assert.equal(next.logo, draft.logo);
  assert.equal(next.description, draft.description);
  assert.equal(draft.website, "");
  assert.equal(withRepositoryDraft(draft, "javascript:alert(1)"), draft);
});
test("blank descriptions disclose independent community status", () => {
  assert.match(
    withRepositoryDraft({ website: "", description: "" }, "owner/repo")
      .description,
    /Not affiliated/,
  );
});
test("network directory exposes only Pons as native launch execution", () => {
  assert.equal(networks.length, 10);
  assert.equal(new Set(networks.map((n) => n.id)).size, 10);
  assert.deepEqual(
    launchpads.filter((p) => p.native).map((p) => p.name),
    ["Pons"],
  );
  assert.ok(
    launchpads
      .filter((p) => !p.native)
      .every((p) => p.href.startsWith("https://")),
  );
});
