import type { AccessRole } from "../core/types.js";
import { AccessRepository } from "../repositories/access-repository.js";

const rank: Record<AccessRole, number> = {
  viewer: 1,
  admin: 2,
  owner: 3
};

export class PermissionService {
  constructor(private readonly accessRepo: AccessRepository) {}

  async hasRole(botId: string, userId: string, needed: AccessRole): Promise<boolean> {
    const role = await this.accessRepo.getRole(botId, userId);
    if (!role) {
      return this.accessRepo.isOwner(botId, userId);
    }
    return rank[role] >= rank[needed];
  }

  async assertRole(botId: string, userId: string, needed: AccessRole): Promise<void> {
    const ok = await this.hasRole(botId, userId, needed);
    if (!ok) {
      throw new Error("You do not have permission for this action");
    }
  }
}
