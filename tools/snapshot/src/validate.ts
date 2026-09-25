import { readFile } from "node:fs/promises";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import snapshotSchema from "../../../schemas/snapshot.schema.json" with { type: "json" };
import { runFairnessChecks, type FairnessIssue } from "./fairness.js";
import { moduleContractErrors, type ModuleSnapshot } from "./module-cache.js";

export interface SnapshotValidationResult {
  ok: boolean;
  schemaOk: boolean;
  fairnessOk: boolean;
  schemaErrors: string[];
  fairnessIssues: FairnessIssue[];
}

let cachedValidator: ValidateFunction | undefined;
const addFormats = addFormatsModule as unknown as (ajv: Ajv2020) => void;

export async function validateSnapshotFile(snapshotPath: string): Promise<SnapshotValidationResult> {
  const content = await readFile(snapshotPath, "utf8");
  return validateSnapshotObject(JSON.parse(content));
}

export async function validateSnapshotObject(snapshot: unknown): Promise<SnapshotValidationResult> {
  const validate = await getValidator();
  const shapeOk = validate(snapshot);
  const schemaErrors = shapeOk
    ? []
    : (validate.errors ?? []).map((error: ErrorObject) => `${error.instancePath || "$"} ${error.message ?? "is invalid"}`);
  if (shapeOk) schemaErrors.push(...moduleContractErrors(snapshot as ModuleSnapshot));
  const schemaOk = schemaErrors.length === 0;
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

  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const compiled = ajv.compile(snapshotSchema);
  cachedValidator = compiled;
  return compiled;
}
