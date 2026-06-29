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
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeTicker(value) {
  return value?.trim().toUpperCase() || "";
}

export function getAvailableQuantity(transactions, ticker) {
  const symbol = normalizeTicker(ticker);

  const bought = transactions
    .filter((tx) => normalizeTicker(tx.ticker) === symbol && tx.type === "BUY")
    .reduce((sum, tx) => sum + Number(tx.quantity), 0);

  const sold = transactions
    .filter((tx) => normalizeTicker(tx.ticker) === symbol && tx.type === "SELL")
    .reduce((sum, tx) => sum + Number(tx.quantity), 0);

  return bought - sold;
}

export function validateTransaction(form, transactions) {
  const ticker = normalizeTicker(form.ticker);
  const quantity = Number(form.quantity);
  const unitPrice = Number(form.unitPrice);
  const fees = Number(form.fees || 0);

  if (!ticker) return "Le ticker est obligatoire.";
  if (!form.date) return "La date est obligatoire.";
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return "La quantité doit être supérieure à 0.";
  }
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    return "Le prix unitaire doit être supérieur à 0.";
  }
  if (!Number.isFinite(fees) || fees < 0) {
    return "Les frais ne peuvent pas être négatifs.";
  }

  if (form.type === "SELL") {
    const available = getAvailableQuantity(transactions, ticker);
    if (quantity > available) {
      return `Vente impossible : tu détiens ${available} ${ticker}.`;
    }
  }

  return null;
}

function sortTransactionsByDate(transactions) {
  return [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
}

function buildPositions(transactions) {
  const positionsMap = new Map();
  let realizedPnL = 0;
  let totalFees = 0;

  for (const tx of sortTransactionsByDate(transactions)) {
    const ticker = normalizeTicker(tx.ticker);
    const current = positionsMap.get(ticker) || {
      ticker,
      name: tx.name?.trim() || ticker,
      quantity: 0,
      costBasis: 0,
    };

    const quantity = Number(tx.quantity);
    const unitPrice = Number(tx.unitPrice);
    const fees = Number(tx.fees || 0);

    totalFees += fees;

    if (tx.type === "BUY") {
      current.quantity += quantity;
      current.costBasis += quantity * unitPrice + fees;
    } else {
      if (quantity > current.quantity) {
        throw new Error(`La vente de ${ticker} dépasse la quantité détenue.`);
      }

      const avgCost =
        current.quantity > 0 ? current.costBasis / current.quantity : 0;
      const proceeds = quantity * unitPrice - fees;
      const removedCost = avgCost * quantity;

      realizedPnL += proceeds - removedCost;
      current.quantity -= quantity;
      current.costBasis -= removedCost;
    }

    if (tx.name?.trim()) {
      current.name = tx.name.trim();
    }

    positionsMap.set(ticker, current);
  }

  return {
    rawPositions: [...positionsMap.values()],
    realizedPnL,
    totalFees,
  };
}

function enrichPositions(rawPositions, prices) {
  return rawPositions
    .filter((item) => item.quantity > 0)
    .map((item) => {
      const currentPrice = Number(prices[item.ticker] || 0);
      const averageCost =
        item.quantity > 0 ? item.costBasis / item.quantity : 0;
      const marketValue =
        currentPrice > 0 ? currentPrice * item.quantity : item.costBasis;
      const unrealizedPnL = marketValue - item.costBasis;
      const unrealizedPct =
        item.costBasis > 0 ? (unrealizedPnL / item.costBasis) * 100 : 0;

      return {
        ...item,
        currentPrice,
        averageCost,
        marketValue,
        unrealizedPnL,
        unrealizedPct,
      };
    });
}

export function computePortfolio(transactions, prices) {
  const { rawPositions, realizedPnL, totalFees } = buildPositions(transactions);
  const positions = enrichPositions(rawPositions, prices);

  const invested = positions.reduce((sum, item) => sum + item.costBasis, 0);
  const currentValue = positions.reduce(
    (sum, item) => sum + item.marketValue,
    0,
  );
  const unrealizedPnL = currentValue - invested;

  return {
    positions,
    invested,
    currentValue,
    unrealizedPnL,
    realizedPnL,
    totalPnL: unrealizedPnL + realizedPnL,
    totalFees,
    transactionCount: transactions.length,
  };
}
