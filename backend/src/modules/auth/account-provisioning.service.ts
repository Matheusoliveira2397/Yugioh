import { Injectable, Logger } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { SeasonsService } from '../seasons/seasons.service';
import { InitialDecksService } from '../initial-decks/initial-decks.service';
import { NewAccountSettingsService } from '../new-account-settings/new-account-settings.service';
import { DivisionsService } from '../divisions/divisions.service';
import { CosmeticsService } from '../cosmetics/cosmetics.service';
import { User } from '../users/entities/user.entity';

export interface ProvisionNewAccountInput {
  nickname: string;
  username: string;
  email: string;
  password: string | null;
  isEmailVerified: boolean;
  emailVerificationToken?: string | null;
  googleId?: string | null;
  authProvider?: string;
  profileImage?: string | null;
  profileSetupCompleted?: boolean;
}

/**
 * Orquestra setup pós-criação de conta (cosméticos, season, deck inicial).
 * Usado por registro local, admin e OAuth — evita duplicação no AuthService.
 */
@Injectable()
export class AccountProvisioningService {
  private readonly logger = new Logger(AccountProvisioningService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly seasonsService: SeasonsService,
    private readonly initialDecksService: InitialDecksService,
    private readonly newAccountSettingsService: NewAccountSettingsService,
    private readonly divisionsService: DivisionsService,
    private readonly cosmeticsService: CosmeticsService,
  ) {}

  async createPlayerAccount(input: ProvisionNewAccountInput): Promise<User> {
    const settings = await this.newAccountSettingsService.getSettings();
    const lowestDivision = await this.divisionsService.getLowestAvailableDivision();

    const user = await this.usersService.create({
      nickname: input.nickname,
      username: input.username,
      email: input.email,
      password: input.password as any,
      level: 1,
      totalScore: 0,
      rankedPoints: 1000,
      winsGeral: 0,
      lossesGeral: 0,
      winsSeason: 0,
      lossesSeason: 0,
      credits: settings.initialCredits,
      cash: settings.initialCash,
      profileImage: input.profileImage || undefined,
      clanTag: undefined,
      biography: undefined,
      playerClass: 'Novato',
      division: lowestDivision,
      isOnline: false,
      isBanned: false,
      banReason: undefined,
      isEmailVerified: input.isEmailVerified,
      emailVerificationToken: input.emailVerificationToken ?? null,
      googleId: input.googleId ?? null,
      authProvider: input.authProvider ?? (input.googleId ? 'google' : 'local'),
      profileSetupCompleted: input.profileSetupCompleted ?? true,
      equippedPlaymatId: null,
      equippedPlaymatImage: null,
      equippedSkinId: null,
      equippedSkinImage: null,
    });

    await this.applyDefaultCosmetics(user.id, settings);
    await this.ensureSeasonRanking(user.id);
    await this.assignInitialDeck(user.id, settings.availableInitialDeckIds);

    return user;
  }

  private async applyDefaultCosmetics(
    userId: number,
    settings: { defaultPlaymatId?: string | null; defaultSkinId?: string | null },
  ): Promise<void> {
    const cosmeticsUpdate: {
      equippedPlaymatId?: string;
      equippedPlaymatImage?: string;
      equippedSkinId?: string;
      equippedSkinImage?: string;
    } = {};
    const playmatId = settings.defaultPlaymatId?.trim() || null;
    const skinId = settings.defaultSkinId?.trim() || null;

    if (playmatId) {
      try {
        const playmat = await this.cosmeticsService.findOnePlaymat(playmatId);
        if (playmat?.image) {
          cosmeticsUpdate.equippedPlaymatId = playmat.id;
          cosmeticsUpdate.equippedPlaymatImage = playmat.image;
        }
      } catch (err: any) {
        this.logger.warn(`Playmat padrão não aplicado (ID ${playmatId}): ${err?.message || err}`);
      }
    }
    if (skinId) {
      try {
        const sleeve = await this.cosmeticsService.findOneSleeve(skinId);
        if (sleeve?.image) {
          cosmeticsUpdate.equippedSkinId = sleeve.id;
          cosmeticsUpdate.equippedSkinImage = sleeve.image;
        }
      } catch (err: any) {
        this.logger.warn(`Sleeve padrão não aplicada (ID ${skinId}): ${err?.message || err}`);
      }
    }
    if (Object.keys(cosmeticsUpdate).length === 0) return;

    await this.usersService.updateCosmetics(userId, cosmeticsUpdate);
    if (cosmeticsUpdate.equippedPlaymatId) {
      await this.usersService.addOwnedPlaymatIfNotPresent(userId, cosmeticsUpdate.equippedPlaymatId);
    }
    if (cosmeticsUpdate.equippedSkinId) {
      await this.usersService.addOwnedSleeveIfNotPresent(userId, cosmeticsUpdate.equippedSkinId);
    }
  }

  private async ensureSeasonRanking(userId: number): Promise<void> {
    try {
      await this.seasonsService.createUserRanking(userId);
    } catch (error) {
      this.logger.warn(`Ranking da season não criado para user ${userId}: ${error}`);
    }
  }

  private async assignInitialDeck(userId: number, availableInitialDeckIds?: string[] | null): Promise<void> {
    try {
      const deckIds =
        availableInitialDeckIds && availableInitialDeckIds.length > 0
          ? availableInitialDeckIds
          : undefined;
      await this.initialDecksService.assignDeckToUser(userId, deckIds);
      this.logger.log(`Deck inicial atribuído ao usuário ${userId}`);
    } catch (error: any) {
      this.logger.warn(
        `Usuário ${userId} criado sem deck inicial: ${error?.message || error}. Configure decks no admin.`,
      );
    }
  }
}
