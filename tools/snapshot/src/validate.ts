import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { runFairnessChecks, type FairnessIssue } from "./fairness.js";

export interface SnapshotValidationResult {
  ok: boolean;
  schemaOk: boolean;
  fairnessOk: boolean;
  schemaErrors: string[];
  fairnessIssues: FairnessIssue[];
}

const schemaUrl = new URL("../../../schemas/snapshot.schema.json", import.meta.url);

let cachedValidator: ValidateFunction | undefined;
const addFormats = addFormatsModule as unknown as (ajv: Ajv2020) => void;

export async function validateSnapshotFile(snapshotPath: string): Promise<SnapshotValidationResult> {
  const content = await readFile(snapshotPath, "utf8");
  return validateSnapshotObject(JSON.parse(content));
}

export async function validateSnapshotObject(snapshot: unknown): Promise<SnapshotValidationResult> {
  const validate = await getValidator();
  const schemaOk = validate(snapshot);
  const schemaErrors = schemaOk
    ? []
    : (validate.errors ?? []).map((error: ErrorObject) => `${error.instancePath || "$"} ${error.message ?? "is invalid"}`);
  const fairnessIssues = runFairnessChecks(snapshot);
  const fairnessOk = fairnessIssues.length === 0;

  return {
    ok: schemaOk && fairnessOk,
    schemaOk,
    fairnessOk,
    schemaErrors,
    fairnessIssues
  };
}

async function getValidator(): Promise<ValidateFunction> {
  if (cachedValidator) {
    return cachedValidator;
  }

  const schemaPath = fileURLToPath(schemaUrl);
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const compiled = ajv.compile(schema);
  cachedValidator = compiled;
  return compiled;
}
