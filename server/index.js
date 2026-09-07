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
  updatedAt: new Date().toISOString(),
};

// Récupérer le taux de change réel EUR/USD depuis Yahoo Finance
async function fetchLiveForexRate() {
  try {
    const response = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/EURUSD=X?interval=1d&range=1d",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        signal: AbortSignal.timeout(3000),
      },
    );
    if (!response.ok) return cachedForex;
    const data = await response.json();
    const rate = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (rate && typeof rate === "number" && rate > 0) {
      cachedForex = {
        EURUSD: rate,
        USDEUR: 1 / rate,
        updatedAt: new Date().toISOString(),
      };
    }
  } catch (err) {
    console.warn("Erreur récupération taux de change EUR/USD (fallback utilisé):", err.message);
  }
  return cachedForex;
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
      currenciesMap[curr.ticker] = curr.currency || (curr.ticker.endsWith(".PA") ? "EUR" : "USD");
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
      cachedForex = fileData.forex;
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
            currency: tx.currency || (tx.ticker.endsWith(".PA") ? "EUR" : "USD"),
            exchangeRate: Number(tx.exchangeRate || 1.0),
          },
        });
      }
      if (fileData.prices && typeof fileData.prices === "object") {
        for (const [ticker, price] of Object.entries(fileData.prices)) {
          const currency = fileData.currencies?.[ticker] || (ticker.endsWith(".PA") ? "EUR" : "USD");
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

// Healthcheck
app.get("/api/health", (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Récupérer le taux de change Forex (EUR/USD)
app.get("/api/forex", async (req, res) => {
  const forex = await fetchLiveForexRate();
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
      currenciesMap[curr.ticker] = curr.currency || (curr.ticker.endsWith(".PA") ? "EUR" : "USD");
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
    if (!ticker || typeof price === "undefined" || isNaN(Number(price))) {
      return res.status(400).json({ error: "Ticker et prix valides requis." });
    }
    const cleanTicker = ticker.trim().toUpperCase();
    const cleanPrice = Number(price);
    const cleanCurrency = currency ? String(currency).trim().toUpperCase() : (cleanTicker.endsWith(".PA") ? "EUR" : "USD");

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
        currency: q.symbol.endsWith(".PA") || q.symbol.endsWith(".MC") ? "EUR" : "USD",
      }));

    res.json(quotes);
  } catch (error) {
    console.warn("Erreur recherche quotes (timeout/réseau):", error.message);
    res.json([]);
  }
});

// Cotations en temps réel pour une liste de tickers (?symbols=AAPL,MC.PA,...)
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
      localFallbackCurrencies[curr.ticker] = curr.currency || (curr.ticker.endsWith(".PA") ? "EUR" : "USD");
    }
  } catch {
    const permData = readPermanentData();
    localFallbackPrices = permData.prices || {};
    localFallbackCurrencies = permData.currencies || {};
  }

  // Requêtes parallèles avec timeout strict (3 secondes par requête)
  await Promise.all(
    symbols.map(async (symbol) => {
      const defaultCurr = symbol.endsWith(".PA") ? "EUR" : "USD";
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
          };
        } else if (localFallbackPrices[symbol]) {
          results[symbol] = {
            price: localFallbackPrices[symbol],
            previousClose: localFallbackPrices[symbol],
            change: 0,
            changePercent: 0,
            currency: localFallbackCurrencies[symbol] || defaultCurr,
            name: symbol,
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
          };
        }
      }
    }),
  );

  // Sauvegarde propre des nouveaux prix en base SQLite et fichier JSON permanent
  let hasNewPrices = false;
  for (const [sym, info] of Object.entries(results)) {
    try {
      if (info.price && info.price > 0) {
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

  if (hasNewPrices) {
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
    const { type, ticker, name, date, quantity, unitPrice, fees, note, currency, exchangeRate } =
      req.body;

    if (!type || !["BUY", "SELL"].includes(type)) {
      return res.status(400).json({ error: "Le type doit être BUY ou SELL." });
    }
    if (!ticker || !ticker.trim()) {
      return res.status(400).json({ error: "Le ticker est obligatoire." });
    }
    const cleanQty = Number(quantity);
    const cleanUnitPrice = Number(unitPrice);
    const cleanFees = Number(fees || 0);

    if (isNaN(cleanQty) || cleanQty <= 0) {
      return res.status(400).json({ error: "La quantité doit être positive." });
    }
    if (isNaN(cleanUnitPrice) || cleanUnitPrice <= 0) {
      return res.status(400).json({ error: "Le prix unitaire doit être positif." });
    }
    if (isNaN(cleanFees) || cleanFees < 0) {
      return res.status(400).json({ error: "Les frais ne peuvent être négatifs." });
    }

    const txDate = new Date(date);
    if (isNaN(txDate.getTime())) {
      return res.status(400).json({ error: "Date invalide." });
    }

    const cleanCurrency = currency === "USD" ? "USD" : "EUR";
    let cleanRate = Number(exchangeRate);
    if (cleanCurrency === "EUR" || isNaN(cleanRate) || cleanRate <= 0) {
      cleanRate = cleanCurrency === "USD" ? cachedForex.EURUSD : 1.0;
    }

    const transaction = await prisma.transaction.create({
      data: {
        type,
        ticker: ticker.trim().toUpperCase(),
        name: (name?.trim() || ticker.trim()).toUpperCase(),
        date: txDate,
        quantity: cleanQty,
        unitPrice: cleanUnitPrice,
        fees: cleanFees,
        note: note ? String(note).trim() : null,
        currency: cleanCurrency,
        exchangeRate: cleanRate,
      },
    });

    await syncDbToPermanentFile();
    res.status(201).json(transaction);
  } catch (error) {
    console.error("Erreur POST /api/transactions:", error);
    res.status(400).json({ error: "Impossible de créer la transaction." });
  }
});

// Transactions : Mettre à jour
app.put("/api/transactions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { type, ticker, name, date, quantity, unitPrice, fees, note, currency, exchangeRate } =
      req.body;

    if (!type || !["BUY", "SELL"].includes(type)) {
      return res.status(400).json({ error: "Le type doit être BUY ou SELL." });
    }
    if (!ticker || !ticker.trim()) {
      return res.status(400).json({ error: "Le ticker est obligatoire." });
    }
    const cleanQty = Number(quantity);
    const cleanUnitPrice = Number(unitPrice);
    const cleanFees = Number(fees || 0);

    if (isNaN(cleanQty) || cleanQty <= 0) {
      return res.status(400).json({ error: "La quantité doit être positive." });
    }
    if (isNaN(cleanUnitPrice) || cleanUnitPrice <= 0) {
      return res.status(400).json({ error: "Le prix unitaire doit être positif." });
    }
    if (isNaN(cleanFees) || cleanFees < 0) {
      return res.status(400).json({ error: "Les frais ne peuvent être négatifs." });
    }

    const txDate = new Date(date);
    if (isNaN(txDate.getTime())) {
      return res.status(400).json({ error: "Date invalide." });
    }

    const cleanCurrency = currency === "USD" ? "USD" : "EUR";
    let cleanRate = Number(exchangeRate);
    if (cleanCurrency === "EUR" || isNaN(cleanRate) || cleanRate <= 0) {
      cleanRate = cleanCurrency === "USD" ? cachedForex.EURUSD : 1.0;
    }

    const transaction = await prisma.transaction.update({
      where: { id },
      data: {
        type,
        ticker: ticker.trim().toUpperCase(),
        name: (name?.trim() || ticker.trim()).toUpperCase(),
        date: txDate,
        quantity: cleanQty,
        unitPrice: cleanUnitPrice,
        fees: cleanFees,
        note: note ? String(note).trim() : null,
        currency: cleanCurrency,
        exchangeRate: cleanRate,
      },
    });

    await syncDbToPermanentFile();
    res.json(transaction);
  } catch (error) {
    console.error("Erreur PUT /api/transactions/:id:", error);
    res.status(400).json({ error: "Impossible de modifier la transaction." });
  }
});

// Transactions : Supprimer
app.delete("/api/transactions/:id", async (req, res) => {
  try {
    const { id } = req.params;
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
    const { transactions, prices, currencies } = req.body;
    if (!Array.isArray(transactions)) {
      return res.status(400).json({ error: "Liste de transactions invalide." });
    }

    for (const tx of transactions) {
      const cleanQty = Number(tx.quantity);
      const cleanUnitPrice = Number(tx.unitPrice);
      const cleanFees = Number(tx.fees || 0);
      const txDate = new Date(tx.date);

      if (isNaN(cleanQty) || isNaN(cleanUnitPrice) || isNaN(txDate.getTime())) continue;

      const currency = tx.currency === "USD" ? "USD" : "EUR";
      const exchangeRate = Number(tx.exchangeRate || (currency === "USD" ? cachedForex.EURUSD : 1.0));

      const dataPayload = {
        type: tx.type === "SELL" ? "SELL" : "BUY",
        ticker: tx.ticker.trim().toUpperCase(),
        name: (tx.name?.trim() || tx.ticker.trim()).toUpperCase(),
        date: txDate,
        quantity: cleanQty,
        unitPrice: cleanUnitPrice,
        fees: cleanFees,
        note: tx.note ? String(tx.note).trim() : null,
        currency,
        exchangeRate,
      };

      if (tx.id) {
        await prisma.transaction.upsert({
          where: { id: String(tx.id) },
          update: dataPayload,
          create: { id: String(tx.id), ...dataPayload },
        });
      } else {
        await prisma.transaction.create({
          data: dataPayload,
        });
      }
    }

    if (prices && typeof prices === "object") {
      for (const [ticker, price] of Object.entries(prices)) {
        const cleanPrice = Number(price);
        const curr = currencies?.[ticker] || (ticker.endsWith(".PA") ? "EUR" : "USD");
        if (!isNaN(cleanPrice) && cleanPrice > 0) {
          await prisma.assetPrice.upsert({
            where: { ticker: ticker.trim().toUpperCase() },
            update: { currentPrice: cleanPrice, currency: curr },
            create: { ticker: ticker.trim().toUpperCase(), currentPrice: cleanPrice, currency: curr },
          });
        }
      }
    }

    await syncDbToPermanentFile();
    const all = await prisma.transaction.findMany({ orderBy: { date: "desc" } });
    res.json({ success: true, count: all.length, transactions: all, forex: cachedForex });
  } catch (error) {
    console.error("Erreur POST /api/transactions/bulk:", error);
    res.status(500).json({ error: "Impossible de synchroniser le lot de transactions." });
  }
});

// Initialiser le stockage permanent au démarrage
await initPermanentStorage();

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`API disponible sur http://localhost:${PORT}`);
});
