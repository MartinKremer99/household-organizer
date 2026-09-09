import { getHouseholdDb } from "@/lib/db";
import type { Household, HouseholdMember } from "@/lib/db";

export const householdRepository = {
  async getById(householdId: string): Promise<Household | null> {
    const row = await getHouseholdDb().households.get(householdId);
    return row ?? null;
  },

  async listMembers(householdId: string): Promise<HouseholdMember[]> {
    return getHouseholdDb()
      .household_members.where("household_id")
      .equals(householdId)
      .toArray();
  },

  async getMembership(
    householdId: string,
    userId: string,
  ): Promise<HouseholdMember | null> {
    const row = await getHouseholdDb().household_members.get([
      householdId,
      userId,
    ]);
    return row ?? null;
  },

  async listMembershipsForUser(userId: string): Promise<HouseholdMember[]> {
    return getHouseholdDb()
      .household_members.where("user_id")
      .equals(userId)
      .toArray();
  },

  async put(household: Household): Promise<void> {
    await getHouseholdDb().households.put(household);
  },

  async putMember(member: HouseholdMember): Promise<void> {
    await getHouseholdDb().household_members.put(member);
  },
};
