// intent: deterministic conservative estimates; SQL owns concurrent reservations.
export type Price = { id: string; microUsdPerMillionUnits: bigint; validUntil: string };
export function estimate(lines: readonly { priceId: string; units: bigint }[], prices: readonly Price[], now: Date): bigint {
  if (!lines.length) throw new Error('Empty cost plan');
  let total = 0n;
  const seen = new Set<string>();
  for (const line of lines) {
    const price = prices.find(p => p.id === line.priceId);
    if (!price || !Number.isFinite(Date.parse(price.validUntil)) || Date.parse(price.validUntil) <= now.getTime() || price.microUsdPerMillionUnits < 0n || line.units <= 0n || seen.has(line.priceId)) throw new Error('Missing, stale or invalid pricing');
    seen.add(line.priceId);
    total += (line.units * price.microUsdPerMillionUnits + 999999n) / 1000000n;
  }
  if (total <= 0n || total > 50000000n) throw new Error('Plan must have a positive cost within the monthly cap');
  return total;
}
