export function formatCurrency(value) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(value || 0);
}

export function formatPercent(value) {
  if (!Number.isFinite(value)) return "0,00 %";
  return `${value.toFixed(2).replace(".", ",")} %`;
}

export function formatQty(value) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

export function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function computePortfolio(transactions, prices) {
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.date) - new Date(b.date),
  );
  const positionsMap = new Map();
  let realizedPnL = 0;
  let totalFees = 0;

  for (const tx of sorted) {
    const key = tx.ticker.trim().toUpperCase();
    const current = positionsMap.get(key) || {
      ticker: key,
      name: tx.name?.trim() || key,
      quantity: 0,
      costBasis: 0,
      realizedPnL: 0,
      fees: 0,
    };

    const qty = Number(tx.quantity);
    const unitPrice = Number(tx.unitPrice);
    const fees = Number(tx.fees || 0);
    totalFees += fees;
    current.fees += fees;
    if (tx.name?.trim()) current.name = tx.name.trim();

    if (tx.type === "BUY") {
      current.costBasis += qty * unitPrice + fees;
      current.quantity += qty;
    }

    if (tx.type === "SELL") {
      if (qty > current.quantity) {
        throw new Error(`La vente de ${key} dépasse la quantité détenue.`);
      }
      const avgCost =
        current.quantity > 0 ? current.costBasis / current.quantity : 0;
      const removedCost = avgCost * qty;
      const proceeds = qty * unitPrice - fees;
      const pnl = proceeds - removedCost;
      current.quantity -= qty;
      current.costBasis -= removedCost;
      current.realizedPnL += pnl;
      realizedPnL += pnl;
    }

    positionsMap.set(key, current);
  }

  const positions = [...positionsMap.values()]
    .filter((position) => position.quantity > 0)
    .map((position) => {
      const currentPrice = Number(prices[position.ticker] || 0);
      const marketValue =
        currentPrice > 0
          ? currentPrice * position.quantity
          : position.costBasis;
      const unrealizedPnL = marketValue - position.costBasis;
      const averageCost =
        position.quantity > 0 ? position.costBasis / position.quantity : 0;
      const unrealizedPct =
        position.costBasis > 0 ? (unrealizedPnL / position.costBasis) * 100 : 0;

      return {
        ...position,
        currentPrice,
        averageCost,
        marketValue,
        unrealizedPnL,
        unrealizedPct,
        allocationBase: position.costBasis,
      };
    })
    .sort((a, b) => b.marketValue - a.marketValue);

  const invested = positions.reduce(
    (sum, position) => sum + position.costBasis,
    0,
  );
  const currentValue = positions.reduce(
    (sum, position) => sum + position.marketValue,
    0,
  );
  const unrealizedPnL = currentValue - invested;
  const totalPnL = realizedPnL + unrealizedPnL;

  return {
    positions,
    invested,
    currentValue,
    unrealizedPnL,
    realizedPnL,
    totalPnL,
    totalFees,
    transactionCount: transactions.length,
  };
}

export function buildMonthlySeries(transactions, prices) {
  const now = new Date();
  const months = [];

  for (let i = 11; i >= 0; i -= 1) {
    const cursor = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    const monthTransactions = transactions.filter(
      (tx) => new Date(tx.date) <= cursor,
    );
    let invested = 0;

    for (const tx of monthTransactions) {
      const qty = Number(tx.quantity);
      const unitPrice = Number(tx.unitPrice);
      const fees = Number(tx.fees || 0);
      invested +=
        tx.type === "BUY" ? qty * unitPrice + fees : -(qty * unitPrice - fees);
    }

    months.push({
      label: new Date(
        now.getFullYear(),
        now.getMonth() - i,
        1,
      ).toLocaleDateString("fr-FR", {
        month: "short",
        year: "2-digit",
      }),
      invested: Math.max(0, invested),
    });
  }

  const snapshot = computePortfolio(transactions, prices);
  const endInvested = months[months.length - 1]?.invested || 0;
  const endValue = snapshot.currentValue || 0;

  return months.map((month) => ({
    ...month,
    value:
      endInvested > 0
        ? (month.invested / endInvested) * endValue
        : month.invested,
  }));
}
