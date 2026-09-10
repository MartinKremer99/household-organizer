type AuthUserLookup = {
  getUser: () => Promise<{
    data: { user: { id: string } | null };
    error: { message?: string } | null;
  }>;
};

export async function getLiveUserId(auth: AuthUserLookup): Promise<string | null> {
  const { data, error } = await auth.getUser();
  if (error || !data.user) {
    return null;
  }
  return data.user.id;
}
