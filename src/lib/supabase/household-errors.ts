export function mapHouseholdError(message: string | undefined): string {
  if (message?.includes("already_member")) {
    return "You already belong to a household.";
  }
  if (message?.includes("invalid_name")) {
    return "Enter a household name (1–80 characters).";
  }
  if (message?.includes("invalid_join_code")) {
    return "Invalid join code.";
  }
  if (message?.includes("not_authenticated")) {
    return "Your session expired. Sign in again.";
  }
  if (message?.includes("schema cache") || message?.includes("create_household")) {
    return "Household setup is not available. Apply the latest database migrations.";
  }
  return "Something went wrong. Try again.";
}
