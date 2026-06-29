export function exportPortfolioJSON({ transactions, prices }) {
  const data = {
    transactions,
    prices,
    exportedAt: new Date().toISOString(),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `portefeuille-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function importPortfolioJSON(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("Aucun fichier sélectionné."));
      return;
    }

    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(String(event.target?.result || "{}"));

        if (!Array.isArray(parsed.transactions)) {
          throw new Error("Format JSON invalide.");
        }

        resolve({
          transactions: parsed.transactions,
          prices: parsed.prices || {},
        });
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error("Impossible de lire le fichier."));
    };

    reader.readAsText(file);
  });
}
