export type AccountKind = "cash";

export type Polarity = "asset" | "liability";

const ACCOUNT_KIND_POLARITY: Record<AccountKind, Polarity> = {
  cash: "asset",
};

export const ACCOUNT_KINDS = Object.keys(ACCOUNT_KIND_POLARITY) as AccountKind[];

export function isAccountKind(kind: string): kind is AccountKind {
  return kind in ACCOUNT_KIND_POLARITY;
}

export function polarityForKind(kind: string): Polarity {
  const polarity = ACCOUNT_KIND_POLARITY[kind as AccountKind];
  if (!polarity) {
    throw new Error(`Unknown account kind: ${kind}`);
  }
  return polarity;
}
