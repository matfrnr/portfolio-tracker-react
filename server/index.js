import express from "express";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "./prisma/generated/prisma/client.ts";

const app = express();
const PORT = process.env.PORT || 3001;

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || "file:./dev.db",
});

const prisma = new PrismaClient({ adapter });

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/transactions", async (req, res) => {
  try {
    const transactions = await prisma.transaction.findMany({
      orderBy: { date: "desc" },
    });
    res.json(transactions);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "Impossible de récupérer les transactions." });
  }
});

app.post("/api/transactions", async (req, res) => {
  try {
    const { type, ticker, name, date, quantity, unitPrice, fees, note } =
      req.body;

    const transaction = await prisma.transaction.create({
      data: {
        type,
        ticker,
        name,
        date: new Date(date),
        quantity: Number(quantity),
        unitPrice: Number(unitPrice),
        fees: Number(fees || 0),
        note: note || null,
      },
    });

    res.status(201).json(transaction);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: "Impossible de créer la transaction." });
  }
});

app.put("/api/transactions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { type, ticker, name, date, quantity, unitPrice, fees, note } =
      req.body;

    const transaction = await prisma.transaction.update({
      where: { id },
      data: {
        type,
        ticker,
        name,
        date: new Date(date),
        quantity: Number(quantity),
        unitPrice: Number(unitPrice),
        fees: Number(fees || 0),
        note: note || null,
      },
    });

    res.json(transaction);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: "Impossible de modifier la transaction." });
  }
});

app.delete("/api/transactions/:id", async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.transaction.delete({
      where: { id },
    });

    res.status(204).end();
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: "Impossible de supprimer la transaction." });
  }
});

app.listen(PORT, () => {
  console.log(`API disponible sur http://localhost:${PORT}`);
});
