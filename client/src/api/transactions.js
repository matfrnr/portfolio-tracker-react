const API_BASE = "/api/transactions";

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

export async function getTransactions() {
  const response = await fetch(API_BASE);
  return handleResponse(response);
}

export async function createTransaction(payload) {
  const response = await fetch(API_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleResponse(response);
}

export async function updateTransaction(id, payload) {
  const response = await fetch(`${API_BASE}/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleResponse(response);
}

export async function deleteTransaction(id) {
  const response = await fetch(`${API_BASE}/${id}`, {
    method: "DELETE",
  });

  return handleResponse(response);
}
