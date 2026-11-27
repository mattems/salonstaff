/**
 * Job seeker profiles reached without signing in as their owner (D-13): a share link (`/p/{code}`)
 * and a referee's one-time link to write an endorsement.
 */
import { ApiError, type EndorsementInput, shareLinkWorks } from "@salonstaff/shared";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { type Actor, recordAudit } from "./audit";
import type { Db } from "./index";
import type { Contact } from "./salon";
import { salonMembers, salons, seekerEndorsements, seekerProfiles, users } from "./schema";
import { type Endorsement, type FullProfile, fullProfileOf, type SeekerProfile } from "./seeker";

export interface SharedProfile {
  userId: string;
  full: FullProfile;
}

export interface EndorsementAsked {
  endorsement: Endorsement;
  profile: SeekerProfile;
}

export function publicProfiles(db: Db) {
  /** A request still waiting for its referee, by its link's token hash. */
  const asked = async (tokenHash: string): Promise<EndorsementAsked | null> => {
    const [row] = await db
      .select({ endorsement: seekerEndorsements, profile: seekerProfiles })
      .from(seekerEndorsements)
      .innerJoin(seekerProfiles, eq(seekerProfiles.userId, seekerEndorsements.userId))
      .innerJoin(users, eq(users.id, seekerEndorsements.userId))
      .where(
        and(
          eq(seekerEndorsements.tokenHash, tokenHash),
          eq(seekerEndorsements.status, "requested"),
          gt(seekerEndorsements.tokenExpiresAt, new Date()),
          isNull(users.suspendedAt),
        ),
      );
    return row ?? null;
  };

  return {
    /** The profile behind a share code, only while it's public and its owner isn't banned. */
    async byShareCode(code: string): Promise<SharedProfile | null> {
      const [row] = await db
        .select({ userId: seekerProfiles.userId, visibility: seekerProfiles.visibility })
        .from(seekerProfiles)
        .innerJoin(users, eq(users.id, seekerProfiles.userId))
        .where(and(eq(seekerProfiles.shareCode, code), isNull(users.suspendedAt)));
      if (!row || !shareLinkWorks(row.visibility)) return null;
      const full = await fullProfileOf(db, row.userId);
      return full ? { userId: row.userId, full } : null;
    },

    asked,

    /** Where to tell the job seeker something. */
    async contactOf(userId: string): Promise<Contact | null> {
      const [row] = await db
        .select({ userId: users.id, email: users.email, phoneNumber: users.phoneNumber })
        .from(users)
        .where(eq(users.id, userId));
      return row ?? null;
    },

    /**
     * The referee's endorsement. The link works once: its token is cleared. Waits for the job
     * seeker to show it. Marked as from a salon when the referee's address is on a salon's team.
     */
    async write(
      tokenHash: string,
      input: EndorsementInput,
      actor: Actor,
    ): Promise<EndorsementAsked> {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(seekerEndorsements)
          .where(eq(seekerEndorsements.tokenHash, tokenHash))
          .for("update");
        const found = row && (await asked(tokenHash));
        if (!found) {
          throw new ApiError("not_found", {
            detail: "This endorsement link has expired or was already used",
            hint: "Ask the person to send you a new one.",
          });
        }
        const [salon] = await tx
          .select({ id: salons.id })
          .from(users)
          .innerJoin(salonMembers, eq(salonMembers.userId, users.id))
          .innerJoin(salons, eq(salons.id, salonMembers.salonId))
          .where(and(eq(users.email, found.endorsement.refereeEmail), eq(salons.status, "active")))
          .orderBy(asc(salonMembers.createdAt))
          .limit(1);
        const [updated] = await tx
          .update(seekerEndorsements)
          .set({
            status: "received",
            tokenHash: null,
            tokenExpiresAt: null,
            refereeName: input.name,
            refereeTitle: input.title,
            salonName: input.salonName,
            relationship: input.relationship,
            body: input.body,
            contactOk: input.contactOk,
            refereePhone: input.contactOk ? (input.phone ?? null) : null,
            refereeSalonId: salon?.id ?? null,
            writtenAt: new Date(),
          })
          .where(eq(seekerEndorsements.id, found.endorsement.id))
          .returning();
        await recordAudit(tx, actor, {
          action: "endorsement.written",
          targetType: "endorsement",
          targetId: found.endorsement.id,
        });
        return { endorsement: updated as Endorsement, profile: found.profile };
      });
    },
  };
}
