import express from "express";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "./prisma/generated/prisma/client.ts";

process.on("unhandledRejection", (reason, promise) => {
  console.warn("Unhandled Rejection:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});

const app = express();
const PORT = process.env.PORT || 3001;

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || "file:./dev.db",
});
// Middleware CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*",
  );

  const prisma = new PrismaClient({ adapter });

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

app.use(express.json());

// Healthcheck
app.get("/api/health", (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Récupérer tous les prix sauvegardés
app.get("/api/prices", async (req, res) => {
  try {
    const prices = await prisma.assetPrice.findMany();
    const pricesMap = prices.reduce((acc, curr) => {
      acc[curr.ticker] = curr.currentPrice;
      return acc;
    }, {});
    res.json(pricesMap);
  } catch (error) {
    console.error("Erreur GET /api/prices:", error);
    res.status(500).json({ error: "Impossible de récupérer les prix." });
  }
});

// Enregistrer ou modifier un prix manuellement
app.post("/api/prices", async (req, res) => {
  try {
    const { ticker, price } = req.body;
    if (!ticker || typeof price === "undefined" || isNaN(Number(price))) {
      return res.status(400).json({ error: "Ticker et prix valides requis." });
    }
    const cleanTicker = ticker.trim().toUpperCase();
    const cleanPrice = Number(price);

    const updated = await prisma.assetPrice.upsert({
      where: { ticker: cleanTicker },
      update: { currentPrice: cleanPrice },
      create: { ticker: cleanTicker, currentPrice: cleanPrice },
    });
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

  const results = {};

  // Requêtes parallèles avec timeout strict (3 secondes par requête)
  await Promise.all(
    symbols.map(async (symbol) => {
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

        if (!response.ok) return;

        const data = await response.json();
        const meta = data?.chart?.result?.[0]?.meta;

        if (meta && typeof meta.regularMarketPrice === "number") {
          const price = meta.regularMarketPrice;
          const previousClose = meta.chartPreviousClose || price;
          const change = price - previousClose;
          const changePercent =
            previousClose > 0 ? (change / previousClose) * 100 : 0;

          results[symbol] = {
            price,
            previousClose,
            change,
            changePercent,
            currency: meta.currency || "EUR",
            name: meta.shortName || meta.longName || symbol,
          };
        }
      } catch (err) {
        // En cas d'erreur ou timeout Yahoo, récupérer le prix local en BDD si disponible
        console.warn(`Cours indisponible pour ${symbol}:`, err.message);
      }
    }),
  );

  // Sauvegarde séquentielle propre des prix en base SQLite (évite les conflits d'écritures)
  for (const [sym, info] of Object.entries(results)) {
    try {
      await prisma.assetPrice.upsert({
        where: { ticker: sym },
        update: { currentPrice: info.price },
        create: { ticker: sym, currentPrice: info.price },
      });
    } catch (e) {
      // no-op
    }
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
    res
      .status(500)
      .json({ error: "Impossible de récupérer les transactions." });
  }
});

// Transactions : Créer
app.post("/api/transactions", async (req, res) => {
  try {
    const { type, ticker, name, date, quantity, unitPrice, fees, note } =
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
      },
    });

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
    const { type, ticker, name, date, quantity, unitPrice, fees, note } =
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
      },
    });

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
    res.status(204).end();
  } catch (error) {
    console.error("Erreur DELETE /api/transactions/:id:", error);
    res.status(400).json({ error: "Impossible de supprimer la transaction." });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API disponible sur http://localhost:${PORT}`);
});
