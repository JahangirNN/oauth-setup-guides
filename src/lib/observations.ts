import type { ObservationOutcome, SetupObservation } from "./types";

const OUTCOMES = new Set<ObservationOutcome>(["observed", "blocked", "not-attempted"]);
const METHODS = new Set<SetupObservation["method"]>(["console", "api", "browser-agent"]);
const RESULTS = new Set<SetupObservation["outcome"]>(["created", "partial", "blocked"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateStep(value: unknown): string[] {
  if (!isRecord(value)) return ["each step must be an object"];
  const errors: string[] = [];
  if (!isNonEmptyString(value.label)) errors.push("step.label is required");
  if (!isNonEmptyString(value.detail)) errors.push("step.detail is required");
  if (typeof value.outcome !== "string" || !OUTCOMES.has(value.outcome as ObservationOutcome)) {
    errors.push("step.outcome must be observed, blocked, or not-attempted");
  }
  return errors;
}

/**
 * Observation records are intentionally strict: they are the only place this
 * project can claim "tested", and they must never contain credentials.
 */
export function validateSetupObservation(value: unknown): string[] {
  if (!isRecord(value)) return ["observation must be an object"];

  const errors: string[] = [];
  if (!isNonEmptyString(value.id)) errors.push("id is required");
  if (!isNonEmptyString(value.provider)) errors.push("provider is required");
  if (!isNonEmptyString(value.attemptedAt) || Number.isNaN(Date.parse(value.attemptedAt))) {
    errors.push("attemptedAt must be an ISO date");
  }
  if (typeof value.method !== "string" || !METHODS.has(value.method as SetupObservation["method"])) {
    errors.push("method must be console, api, or browser-agent");
  }
  if (typeof value.outcome !== "string" || !RESULTS.has(value.outcome as SetupObservation["outcome"])) {
    errors.push("outcome must be created, partial, or blocked");
  }
  if (!Array.isArray(value.steps) || value.steps.length === 0) {
    errors.push("at least one step is required");
  } else {
    for (const step of value.steps) errors.push(...validateStep(step));
  }

  if (!isRecord(value.created)) {
    errors.push("created is required");
  } else {
    for (const key of ["oauthApp", "clientId", "clientSecret", "submittedForReview"]) {
      if (typeof value.created[key] !== "boolean") errors.push(`created.${key} must be boolean`);
    }
    if (value.outcome === "created" && value.created.oauthApp !== true) {
      errors.push("a created outcome must record created.oauthApp=true");
    }
    if (value.outcome === "blocked" && value.created.oauthApp === true) {
      errors.push("use outcome=partial when the app was created but the attempt stopped");
    }
  }

  if (value.credentialsStored !== false) {
    errors.push("credentialsStored must be false; never store provider credentials");
  }
  if (!isNonEmptyString(value.notes)) errors.push("notes is required");

  const serialized = JSON.stringify(value);
  if (
    /(?:client[_-]?secret|access[_-]?token|refresh[_-]?token|password)\s*[:=]\s*["']?[A-Za-z0-9_\-]{12,}/i.test(
      serialized
    ) ||
    /Bearer\s+[A-Za-z0-9._-]{20,}/i.test(serialized)
  ) {
    errors.push("observation appears to contain a credential; redact it before saving");
  }

  return [...new Set(errors)];
}

export function isSetupObservation(value: unknown): value is SetupObservation {
  return validateSetupObservation(value).length === 0;
}
