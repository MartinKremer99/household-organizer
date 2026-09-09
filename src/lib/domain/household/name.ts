import { err, ok, type DomainResult } from "../result";

export function validateHouseholdName(name: string): DomainResult<string> {
  const trimmed = name.trim();

  if (trimmed.length < 1 || trimmed.length > 80) {
    return err("invalid_name");
  }

  return ok(trimmed);
}
