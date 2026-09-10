const MESSAGES: Record<string, string> = {
  invalid_name: "Enter a household name (1–80 characters).",
  invalid_household: "Could not save. Try again.",
  persistence_failure: "Could not save. Try again.",
};

export function householdSettingsErrorMessage(code: string): string {
  return MESSAGES[code] ?? "Could not save. Try again.";
}
