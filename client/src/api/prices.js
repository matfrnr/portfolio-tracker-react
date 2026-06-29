const API_BASE = "/api/prices";

async function handleResponse(response) {
  if (!response.ok) {
    let message = "Erreur API";

    try {
      const data = await response.json();
      message = data.error || message;
    } catch {}

    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}

export async function getPrices() {
  const response = await fetch(API_BASE);
  return handleResponse(response);
}

export async function updatePrice(ticker, price) {
  const response = await fetch(API_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ticker, price }),
  });

  return handleResponse(response);
}
