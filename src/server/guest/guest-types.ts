export type GuestSessionRecord = {
  id: string;
  guestToken: string;
  trialMessageCount: number;
  mergedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateGuestSessionInput = {
  guestToken: string;
  expiresAt: Date;
};

export type MergeGuestSessionInput = {
  guestSessionId: string;
  userId: string;
  mergedAt: Date;
};

export type MergeGuestSessionResult = {
  mergedGuestSession: GuestSessionRecord;
  mergedChatCount: number;
};
