import assert from "node:assert/strict";
import { deriveHeader, guideLooksComplete } from "../src/lib/synthesize";
import type { Claim } from "../src/lib/types";

function claim(value: string): Claim {
  return {
    id: "test",
    slot: "reviewRequired",
    value,
    quote: value,
    sourceUrl: "https://example.com/docs",
    sourceTitle: "Example docs",
    sourceTier: 1,
    status: "documented",
    match: "exact",
    confidence: 0.9,
    fetchedAt: new Date().toISOString(),
  };
}

assert.equal(
  deriveHeader("Discord", "discord.com", [claim("Yes, but only for certain scopes: some scopes require approval.")], [])
    .reviewRequired,
  "sometimes",
  "conditional review must not be classified as no-review"
);
assert.equal(
  deriveHeader("Example", "example.com", [claim("No app review is required.")], []).reviewRequired,
  "no"
);
assert.equal(
  deriveHeader("Example", "example.com", [claim("Yes, app review is required before launch.")], [])
    .reviewRequired,
  "yes"
);
assert.equal(
  deriveHeader("Example", "example.com", [claim("Yes, every app requires approval.")], [])
    .reviewRequired,
  "yes",
  "universal review must not be mistaken for conditional review"
);
assert.equal(
  deriveHeader("Example", "example.com", [claim("Sensitive scopes require approval.")], [])
    .reviewRequired,
  "sometimes"
);

assert.equal(guideLooksComplete("Final will be here"), false);
assert.equal(guideLooksComplete("## Do you need your own OAuth app?\n\nToo short."), false);

const realGuide = `## Do you need your own OAuth app?

${"This paragraph explains the setup and the gate. ".repeat(20)}

## Step-by-step setup

${"1. Do the documented step. ".repeat(20)}

## Approval and review

${"No review is documented. ".repeat(20)}
`;
assert.equal(guideLooksComplete(realGuide), true);

console.log("selftest passed");
