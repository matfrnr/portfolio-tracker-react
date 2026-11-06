import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "./prisma/generated/prisma/client.ts";

process.on("unhandledRejection", (reason, promise) => {
  console.warn("Unhandled Rejection:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "portfolio-data.json");

const app = express();
const PORT = process.env.PORT || 3001;

// Initialisation unique du client Prisma au niveau module (Singleton)
const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

// Cache mémoire du taux de change EUR/USD
let cachedForex = {
  EURUSD: 1.085,
  USDEUR: 1 / 1.085,
  rates: { EUR: 1, USD: 1.085 },
  rateUpdatedAt: {},
  updatedAt: "2000-01-01T00:00:00.000Z",
};

function defaultCurrencyForTicker(ticker = "") {
  const symbol = String(ticker).trim().toUpperCase();
  if (/\.(PA|DE|F|DU|AS|BR|MC|MI|VI|HE|IR)$/.test(symbol)) return "EUR";
  if (symbol.endsWith(".L")) return "GBP";
  if (symbol.endsWith(".SW")) return "CHF";
  if (/\.(TO|V)$/.test(symbol)) return "CAD";
  if (symbol.endsWith(".AX")) return "AUD";
  if (symbol.endsWith(".T")) return "JPY";
  if (symbol.endsWith(".ST")) return "SEK";
  if (symbol.endsWith(".OL")) return "NOK";
  if (symbol.endsWith(".CO")) return "DKK";
  if (symbol.endsWith("-EUR")) return "EUR";
  if (symbol.endsWith("-GBP")) return "GBP";
  if (symbol.endsWith("-CAD")) return "CAD";
  if (symbol.endsWith("-USD")) return "USD";
  return "USD";
}

async function fetchLiveForexRate(currencies = []) {
  const requested = new Set(["USD", ...currencies.map((value) => String(value).toUpperCase())]);
  const rates = { EUR: 1, ...(cachedForex.rates || {}), USD: cachedForex.EURUSD || 1.085 };
  const rateUpdatedAt = { ...(cachedForex.rateUpdatedAt || {}) };
  const toFetch = [...requested].filter((currency) => {
    if (!/^[A-Z]{3}$/.test(currency) || currency === "EUR") return false;
    const updatedAt = new Date(rateUpdatedAt[currency] || cachedForex.updatedAt || 0).getTime();
    return !rates[currency] || Date.now() - updatedAt > 15 * 60 * 1000;
  });
  const refreshedCurrencies = [];

  await Promise.all(toFetch.map(async (currency) => {
    try {
      const symbol = `EUR${currency}=X`;
      const response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
        {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
          signal: AbortSignal.timeout(3000),
        },
      );
      if (!response.ok) return;
      const data = await response.json();
      const rate = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (typeof rate === "number" && rate > 0) {
        rates[currency] = rate;
        rateUpdatedAt[currency] = new Date().toISOString();
        refreshedCurrencies.push(currency);
      }
    } catch (err) {
      console.warn(`Erreur récupération du taux EUR/${currency} (valeur précédente conservée):`, err.message);
    }
  }));

  const eurUsd = rates.USD || cachedForex.EURUSD || 1.085;
  cachedForex = {
    ...cachedForex,
    EURUSD: eurUsd,
    USDEUR: 1 / eurUsd,
    rates,
    rateUpdatedAt,
    updatedAt: refreshedCurrencies.length ? new Date().toISOString() : cachedForex.updatedAt,
  };
  return cachedForex;
}

function normalizeTransactionInput(tx) {
  const type = String(tx.type || "").toUpperCase();
  if (!["BUY", "SELL", "DIVIDEND"].includes(type)) throw new Error("Type d'opération invalide.");
  const ticker = String(tx.ticker || "").trim().toUpperCase();
  if (!ticker) throw new Error("Le ticker est obligatoire.");
  const quantity = type === "DIVIDEND" ? 1 : Number(tx.quantity);
  const unitPrice = Number(tx.unitPrice);
  const fees = Number(tx.fees || 0);
  const date = new Date(tx.date);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("La quantité doit être positive.");
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw new Error("Le prix ou montant doit être positif.");
  if (!Number.isFinite(fees) || fees < 0) throw new Error("Les frais ou retenues ne peuvent pas être négatifs.");
  if (type === "DIVIDEND" && fees > unitPrice) throw new Error("Les retenues dépassent le montant brut du dividende.");
  if (Number.isNaN(date.getTime())) throw new Error("Date invalide.");
  const requestedCurrency = String(tx.currency || defaultCurrencyForTicker(ticker)).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(requestedCurrency)) throw new Error("Code devise invalide.");
  const suppliedRate = Number(tx.exchangeRate);
  const currentRate = cachedForex.rates?.[requestedCurrency] || (requestedCurrency === "USD" ? cachedForex.EURUSD : 0);
  const exchangeRate = requestedCurrency === "EUR" ? 1 : (Number.isFinite(suppliedRate) && suppliedRate > 0 ? suppliedRate : currentRate);
  if (requestedCurrency !== "EUR" && !(exchangeRate > 0)) throw new Error(`Taux de change indisponible pour ${requestedCurrency}; indiquez-le dans l'import CSV.`);
  return {
    id: tx.id ? String(tx.id) : undefined,
    type,
    ticker,
    name: String(tx.name || ticker).trim() || ticker,
    date,
    quantity,
    unitPrice,
    fees,
    note: tx.note ? String(tx.note).trim() : null,
    currency: requestedCurrency,
    exchangeRate,
    createdAt: tx.createdAt ? new Date(tx.createdAt) : undefined,
  };
}

function findOversoldTransactions(transactions) {
  const holdings = new Map();
  const ordered = [...transactions].sort((a, b) => {
    const dateDifference = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (dateDifference) return dateDifference;
    const createdDifference = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    return createdDifference || String(a.id || "").localeCompare(String(b.id || ""));
  });
  const issues = [];
  for (const tx of ordered) {
    if (tx.type === "DIVIDEND") continue;
    const ticker = String(tx.ticker || "").toUpperCase();
    const held = holdings.get(ticker) || 0;
    const quantity = Number(tx.quantity || 0);
    if (tx.type === "BUY") holdings.set(ticker, held + quantity);
    if (tx.type === "SELL") {
      if (quantity > held + 1e-6) issues.push(`Vente de ${quantity} ${ticker} le ${new Date(tx.date).toLocaleDateString("fr-FR")} alors que ${Math.max(0, held)} seulement étaient détenus.`);
      holdings.set(ticker, Math.max(0, held - quantity));
    }
  }
  return issues;
}

async function historyIssueAfterChange(candidate, excludedId = null) {
  const existing = await prisma.transaction.findMany();
  const history = existing.filter((tx) => tx.id !== excludedId);
  const previousIssues = findOversoldTransactions(history);
  history.push({
    ...candidate,
    id: candidate.id || "__candidate__",
    createdAt: candidate.createdAt || new Date().toISOString(),
  });
  const previousSignatures = new Set(previousIssues.map((issue) => issue.message));
  return findOversoldTransactions(history).filter((issue) => !previousSignatures.has(issue.message));
}

// Helpers pour la persistance permanente en fichier JSON
function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    const initial = {
      transactions: [],
      prices: {},
      currencies: {},
      forex: cachedForex,
      lastUpdated: new Date().toISOString(),
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), "utf8");
  }
}

function readPermanentData() {
  try {
    ensureDataFile();
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("Erreur lecture portfolio-data.json:", err);
    return {
      transactions: [],
      prices: {},
      currencies: {},
      forex: cachedForex,
      lastUpdated: new Date().toISOString(),
    };
  }
}

function writePermanentData(data) {
  try {
    ensureDataFile();
    const payload = {
      transactions: data.transactions || [],
      prices: data.prices || {},
      currencies: data.currencies || {},
      forex: data.forex || cachedForex,
      lastUpdated: new Date().toISOString(),
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), "utf8");
  } catch (err) {
    console.error("Erreur écriture portfolio-data.json:", err);
  }
}

async function syncDbToPermanentFile() {
  try {
    const [transactions, pricesList] = await Promise.all([
      prisma.transaction.findMany({ orderBy: { date: "desc" } }),
      prisma.assetPrice.findMany(),
    ]);
    const pricesMap = {};
    const currenciesMap = {};
    for (const curr of pricesList) {
      pricesMap[curr.ticker] = curr.currentPrice;
      currenciesMap[curr.ticker] = curr.currency || defaultCurrencyForTicker(curr.ticker);
    }

    writePermanentData({
      transactions,
      prices: pricesMap,
      currencies: currenciesMap,
      forex: cachedForex,
    });
  } catch (err) {
    console.error("Erreur synchronisation DB vers JSON:", err);
  }
}

async function initPermanentStorage() {
  try {
    ensureDataFile();
    const count = await prisma.transaction.count();
    const fileData = readPermanentData();

    if (fileData.forex && fileData.forex.EURUSD) {
      cachedForex = {
        ...cachedForex,
        ...fileData.forex,
        rates: { EUR: 1, USD: fileData.forex.EURUSD, ...(fileData.forex.rates || {}) },
      };
    }

    // Si SQLite est vide mais que le fichier JSON permanent a des données, restaurer SQLite
    if (count === 0 && Array.isArray(fileData.transactions) && fileData.transactions.length > 0) {
      console.log(`Restauration permanente : ${fileData.transactions.length} transaction(s) chargées depuis le fichier JSON.`);
      for (const tx of fileData.transactions) {
        await prisma.transaction.create({
          data: {
            id: tx.id,
            type: tx.type,
            ticker: tx.ticker,
            name: tx.name || tx.ticker,
            date: new Date(tx.date),
            quantity: Number(tx.quantity),
            unitPrice: Number(tx.unitPrice),
            fees: Number(tx.fees || 0),
            note: tx.note || null,
            currency: tx.currency || defaultCurrencyForTicker(tx.ticker),
            exchangeRate: Number(tx.exchangeRate || cachedForex.rates?.[tx.currency] || (tx.currency === "USD" ? cachedForex.EURUSD : 1.0)),
          },
        });
      }
      if (fileData.prices && typeof fileData.prices === "object") {
        for (const [ticker, price] of Object.entries(fileData.prices)) {
          const currency = fileData.currencies?.[ticker] || defaultCurrencyForTicker(ticker);
          await prisma.assetPrice.upsert({
            where: { ticker },
            update: { currentPrice: Number(price), currency },
            create: { ticker, currentPrice: Number(price), currency },
          });
        }
      }
      console.log("Restauration permanente terminée avec succès.");
    } else {
      await syncDbToPermanentFile();
    }
  } catch (err) {
    console.error("Erreur initialisation stockage permanent:", err);
  }
}

// Middleware CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept",
  );
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: "10mb" }));

// Portfolio data is stored in Supabase with per-user RLS in production.
// Keep the legacy local-only endpoints unavailable on a public deployment.
app.use((req, res, next) => {
  if (
    process.env.NODE_ENV === "production" &&
    /^\/api\/(transactions|prices)(\/|$)/.test(req.path)
  ) {
    return res.status(404).json({ error: "Cette route locale n'est pas disponible." });
  }
  next();
});

// Healthcheck
app.get("/api/health", (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Récupérer le taux de change Forex (EUR/USD)
app.get("/api/forex", async (req, res) => {
  const requested = typeof req.query.currencies === "string"
    ? req.query.currencies.split(",").map((value) => value.trim().toUpperCase()).filter(Boolean)
    : ["USD", "GBP", "CHF", "CAD", "AUD", "JPY", "SEK", "NOK", "DKK", "CNY", "HKD", "NZD", "SGD"];
  const forex = await fetchLiveForexRate(requested);
  res.json(forex);
});

// Récupérer tous les prix sauvegardés avec leurs devises
app.get("/api/prices", async (req, res) => {
  try {
    const prices = await prisma.assetPrice.findMany();
    const pricesMap = {};
    const currenciesMap = {};
    for (const curr of prices) {
      pricesMap[curr.ticker] = curr.currentPrice;
      currenciesMap[curr.ticker] = curr.currency || defaultCurrencyForTicker(curr.ticker);
    }
    res.json({
      prices: pricesMap,
      currencies: currenciesMap,
      forex: cachedForex,
    });
  } catch (error) {
    console.error("Erreur GET /api/prices:", error);
    const fallback = readPermanentData();
    res.json({
      prices: fallback.prices || {},
      currencies: fallback.currencies || {},
      forex: cachedForex,
    });
  }
});

// Enregistrer ou modifier un prix manuellement
app.post("/api/prices", async (req, res) => {
  try {
    const { ticker, price, currency } = req.body;
    if (!ticker || typeof price === "undefined" || !Number.isFinite(Number(price)) || Number(price) <= 0) {
      return res.status(400).json({ error: "Ticker et prix valides requis." });
    }
    const cleanTicker = ticker.trim().toUpperCase();
    const cleanPrice = Number(price);
    const cleanCurrency = currency ? String(currency).trim().toUpperCase() : defaultCurrencyForTicker(cleanTicker);
    if (!/^[A-Z]{3}$/.test(cleanCurrency)) {
      return res.status(400).json({ error: "Code devise invalide." });
    }

    const updated = await prisma.assetPrice.upsert({
      where: { ticker: cleanTicker },
      update: { currentPrice: cleanPrice, currency: cleanCurrency },
      create: { ticker: cleanTicker, currentPrice: cleanPrice, currency: cleanCurrency },
    });

    await syncDbToPermanentFile();
    res.json(updated);
  } catch (error) {
    console.error("Erreur POST /api/prices:", error);
    res.status(400).json({ error: "Impossible de mettre à jour le prix." });
  }
});

// Recherche de tickers en direct (Yahoo Finance search)
app.get("/api/quotes/search", async (req, res) => {
  const query = req.query.q;
  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return res.json([]);
  }

  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
        query.trim(),
      )}&quotesCount=8&newsCount=0`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        signal: AbortSignal.timeout(3000),
      },
    );

    if (!response.ok) {
      return res.json([]);
    }

    const data = await response.json();
    const quotes = (data.quotes || [])
      .filter((q) => q.symbol && (q.shortname || q.longname))
      .map((q) => ({
        symbol: q.symbol,
        name: q.shortname || q.longname,
        exchange: q.exchange,
        type: q.quoteType,
        currency: q.currency || defaultCurrencyForTicker(q.symbol),
      }));

    res.json(quotes);
  } catch (error) {
    console.warn("Erreur recherche quotes (timeout/réseau):", error.message);
    res.json([]);
  }
});

// Cotations en temps réel pour une liste de tickers (?symbols=AAPL,MC.PA,...)
// Dividendes par action versés sur les 12 derniers mois, fournis par Yahoo Finance.
app.get("/api/dividends", async (req, res) => {
  const symbols = typeof req.query.symbols === "string"
    ? [...new Set(req.query.symbols.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean))]
    : [];
  const results = {};
  await Promise.all(symbols.map(async (symbol) => {
    try {
      const response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1mo&range=5y&events=dividends`,
        { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000) },
      );
      if (!response.ok) return;
      const result = (await response.json())?.chart?.result?.[0];
      if (!result) return;
      const cutoff = Math.floor((Date.now() - 365.25 * 86400000) / 1000);
      const events = Object.values(result.events?.dividends || {});
      const dividendPerShare = events
        .filter((event) => Number(event.date) >= cutoff && Number(event.date) <= Math.floor(Date.now() / 1000))
        .reduce((sum, event) => sum + (Number(event.amount) || 0), 0);
      results[symbol] = {
        dividendPerShare,
        currency: result.meta?.currency || "EUR",
        source: "Yahoo Finance",
        asOf: new Date().toISOString(),
      };
    } catch {
      // Un symbole sans donnée reste absent : le client l'affichera comme indisponible.
    }
  }));
  res.json(results);
});

app.get("/api/quotes", async (req, res) => {
  const symbolsParam = req.query.symbols;
  if (!symbolsParam || typeof symbolsParam !== "string") {
    return res.json({});
  }

  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (symbols.length === 0) {
    return res.json({});
  }

  // Mettre à jour le taux Forex en tâche de fond
  fetchLiveForexRate().catch(() => {});

  const results = {};

  // Charger les prix locaux en mémoire de repli (fallback si Yahoo échoue ou rate-limit)
  let localFallbackPrices = {};
  let localFallbackCurrencies = {};
  try {
    const savedPrices = await prisma.assetPrice.findMany({
      where: { ticker: { in: symbols } },
    });
    for (const curr of savedPrices) {
      localFallbackPrices[curr.ticker] = curr.currentPrice;
      localFallbackCurrencies[curr.ticker] = curr.currency || defaultCurrencyForTicker(curr.ticker);
    }
  } catch {
    const permData = readPermanentData();
    localFallbackPrices = permData.prices || {};
    localFallbackCurrencies = permData.currencies || {};
  }

  // Requêtes parallèles avec timeout strict (3 secondes par requête)
  await Promise.all(
    symbols.map(async (symbol) => {
      const defaultCurr = localFallbackCurrencies[symbol] || defaultCurrencyForTicker(symbol);
      try {
        const response = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
            symbol,
          )}?interval=1d&range=1d`,
          {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
            signal: AbortSignal.timeout(3000),
          },
        );

        if (!response.ok) {
          if (localFallbackPrices[symbol]) {
            results[symbol] = {
              price: localFallbackPrices[symbol],
              previousClose: localFallbackPrices[symbol],
              change: 0,
              changePercent: 0,
              currency: localFallbackCurrencies[symbol] || defaultCurr,
              name: symbol,
              isFallback: true,
            };
          }
          return;
        }

        const data = await response.json();
        const meta = data?.chart?.result?.[0]?.meta;

        if (meta && typeof meta.regularMarketPrice === "number") {
          const price = meta.regularMarketPrice;
          const previousClose = meta.chartPreviousClose || price;
          const change = price - previousClose;
          const changePercent =
            previousClose > 0 ? (change / previousClose) * 100 : 0;

          const currency = meta.currency || defaultCurr;

          results[symbol] = {
            price,
            previousClose,
            change,
            changePercent,
            currency,
            name: meta.shortName || meta.longName || symbol,
            isFallback: false,
          };
        } else if (localFallbackPrices[symbol]) {
          results[symbol] = {
            price: localFallbackPrices[symbol],
            previousClose: localFallbackPrices[symbol],
            change: 0,
            changePercent: 0,
            currency: localFallbackCurrencies[symbol] || defaultCurr,
            name: symbol,
            isFallback: true,
          };
        }
      } catch (err) {
        if (localFallbackPrices[symbol]) {
          results[symbol] = {
            price: localFallbackPrices[symbol],
            previousClose: localFallbackPrices[symbol],
            change: 0,
            changePercent: 0,
            currency: localFallbackCurrencies[symbol] || defaultCurr,
            name: symbol,
            isFallback: true,
          };
        }
      }
    }),
  );

  // Sauvegarde propre des nouveaux prix en base SQLite et fichier JSON permanent
  let hasNewPrices = false;
  for (const [sym, info] of Object.entries(results)) {
    try {
      if (!info.isFallback && info.price && info.price > 0) {
        await prisma.assetPrice.upsert({
          where: { ticker: sym },
          update: { currentPrice: info.price, currency: info.currency || "USD" },
          create: { ticker: sym, currentPrice: info.price, currency: info.currency || "USD" },
        });
        hasNewPrices = true;
      }
    } catch (e) {
      // no-op
    }
  }

  if (hasNewPrices && process.env.NODE_ENV !== "production") {
    await syncDbToPermanentFile();
  }

  res.json(results);
});

// Transactions : Lister
app.get("/api/transactions", async (req, res) => {
  try {
    const transactions = await prisma.transaction.findMany({
      orderBy: { date: "desc" },
    });
    res.json(transactions);
  } catch (error) {
    console.error("Erreur GET /api/transactions:", error);
    const fallback = readPermanentData();
    res.json(fallback.transactions || []);
  }
});

// Transactions : Créer
app.post("/api/transactions", async (req, res) => {
  try {
    const data = normalizeTransactionInput(req.body);
    const historyIssues = await historyIssueAfterChange(data);
    if (historyIssues.length) return res.status(400).json({ error: historyIssues[0] });
    const transaction = await prisma.transaction.create({ data });

    await syncDbToPermanentFile();
    res.status(201).json(transaction);
  } catch (error) {
    console.error("Erreur POST /api/transactions:", error);
    res.status(400).json({ error: error.message || "Impossible de créer la transaction." });
  }
});

// Transactions : Mettre à jour
app.put("/api/transactions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const existingTransaction = await prisma.transaction.findUnique({ where: { id } });
    if (!existingTransaction) return res.status(404).json({ error: "Transaction introuvable." });
    const data = normalizeTransactionInput(req.body);
    data.id = id;
    data.createdAt = existingTransaction.createdAt;
    const historyIssues = await historyIssueAfterChange(data, id);
    if (historyIssues.length) return res.status(400).json({ error: historyIssues[0] });
    delete data.id;
    delete data.createdAt;
    const transaction = await prisma.transaction.update({ where: { id }, data });

    await syncDbToPermanentFile();
    res.json(transaction);
  } catch (error) {
    console.error("Erreur PUT /api/transactions/:id:", error);
    res.status(400).json({ error: error.message || "Impossible de modifier la transaction." });
  }
});

// Transactions : Supprimer
app.delete("/api/transactions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.transaction.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Transaction introuvable." });
    const allTransactions = await prisma.transaction.findMany();
    const previousIssueMessages = new Set(findOversoldTransactions(allTransactions).map((issue) => issue.message));
    const remaining = allTransactions.filter((tx) => tx.id !== id);
    const historyIssues = findOversoldTransactions(remaining).filter((issue) => !previousIssueMessages.has(issue.message));
    if (historyIssues.length) return res.status(400).json({ error: historyIssues[0] });
    await prisma.transaction.delete({
      where: { id },
    });

    await syncDbToPermanentFile();
    res.status(204).end();
  } catch (error) {
    console.error("Erreur DELETE /api/transactions/:id:", error);
    res.status(400).json({ error: "Impossible de supprimer la transaction." });
  }
});

// Importation / Synchronisation en masse
app.post("/api/transactions/bulk", async (req, res) => {
  try {
    const { transactions, prices, currencies, replace = false, replacePrices = false } = req.body;
    if (!Array.isArray(transactions)) {
      return res.status(400).json({ error: "Liste de transactions invalide." });
    }
    if (transactions.length === 0) return res.status(400).json({ error: "Aucune transaction à importer." });
    const normalized = [];
    for (let index = 0; index < transactions.length; index += 1) {
      try {
        normalized.push(normalizeTransactionInput(transactions[index]));
      } catch (error) {
        return res.status(400).json({ error: `Ligne ${index + 1} : ${error.message}` });
      }
    }
    const importedIds = normalized.map((tx) => tx.id).filter(Boolean);
    if (new Set(importedIds).size !== importedIds.length) {
      return res.status(400).json({ error: "Le fichier contient des identifiants de transaction en double." });
    }

    const existing = replace ? [] : await prisma.transaction.findMany();
    const mergedById = new Map(existing.map((tx) => [tx.id, tx]));
    normalized.forEach((tx, index) => {
      if (tx.id) mergedById.set(tx.id, tx);
      else mergedById.set(`new-${index}`, tx);
    });
    const historyIssues = findOversoldTransactions([...mergedById.values()]);
    if (historyIssues.length) return res.status(400).json({ error: historyIssues[0] });

    await prisma.$transaction(async (db) => {
      if (replace) await db.transaction.deleteMany();
      if (replacePrices) await db.assetPrice.deleteMany();
      for (const normalizedTransaction of normalized) {
        const { id, ...dataPayload } = normalizedTransaction;
        if (id) {
          await db.transaction.upsert({
            where: { id },
            update: dataPayload,
            create: { id, ...dataPayload },
          });
        } else {
          await db.transaction.create({ data: dataPayload });
        }
      }

      if (prices && typeof prices === "object") {
        for (const [ticker, price] of Object.entries(prices)) {
          const cleanPrice = Number(price);
          const normalizedTicker = ticker.trim().toUpperCase();
          const curr = currencies?.[ticker] || currencies?.[normalizedTicker] || defaultCurrencyForTicker(ticker);
          if (!isNaN(cleanPrice) && cleanPrice > 0) {
            await db.assetPrice.upsert({
              where: { ticker: normalizedTicker },
              update: { currentPrice: cleanPrice, currency: curr },
              create: { ticker: normalizedTicker, currentPrice: cleanPrice, currency: curr },
            });
          }
        }
      }
    });

    await syncDbToPermanentFile();
    const all = await prisma.transaction.findMany({ orderBy: { date: "desc" } });
    res.json({ success: true, count: all.length, transactions: all, forex: cachedForex });
  } catch (error) {
    console.error("Erreur POST /api/transactions/bulk:", error);
    res.status(500).json({ error: "Impossible de synchroniser le lot de transactions." });
  }
});

// Initialiser le stockage SQLite/JSON uniquement pour le mode de développement local.
if (process.env.NODE_ENV !== "production") {
  await initPermanentStorage();
}

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`API disponible sur http://localhost:${PORT}`);
});
