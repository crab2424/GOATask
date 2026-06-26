import { apiFetch } from "./client";

export interface Card {
  id: number;
  deck_id: number;
  front: string;
  back: string;
  marked: boolean;
  correct_count: number;
  wrong_count: number;
  created_at: string;
  updated_at: string;
}

export interface Deck {
  id: number;
  name: string;
  cards?: Card[];
  created_at: string;
  updated_at: string;
}

export async function listDecks(): Promise<Deck[]> {
  const res = await apiFetch(`/api/decks`);
  if (!res.ok) throw new Error(`listDecks failed: ${res.status}`);
  return res.json();
}

export async function createDeck(name: string): Promise<Deck> {
  const res = await apiFetch(`/api/decks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`createDeck failed: ${res.status}`);
  return res.json();
}

export async function updateDeck(id: number, name: string): Promise<Deck> {
  const res = await apiFetch(`/api/decks/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`updateDeck failed: ${res.status}`);
  return res.json();
}

export async function deleteDeck(id: number): Promise<void> {
  const res = await apiFetch(`/api/decks/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`deleteDeck failed: ${res.status}`);
}

export async function listCards(deckId: number): Promise<Card[]> {
  const res = await apiFetch(`/api/decks/${deckId}/cards`);
  if (!res.ok) throw new Error(`listCards failed: ${res.status}`);
  return res.json();
}

export async function createCard(
  deckId: number,
  front: string,
  back: string,
): Promise<Card> {
  const res = await apiFetch(`/api/decks/${deckId}/cards`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ front, back }),
  });
  if (!res.ok) throw new Error(`createCard failed: ${res.status}`);
  return res.json();
}

export async function importCards(
  deckId: number,
  cards: { front: string; back: string }[],
): Promise<Card[]> {
  const res = await apiFetch(`/api/decks/${deckId}/cards/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cards }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`importCards failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function updateCard(
  deckId: number,
  cardId: number,
  front: string,
  back: string,
): Promise<Card> {
  const res = await apiFetch(`/api/decks/${deckId}/cards/${cardId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ front, back }),
  });
  if (!res.ok) throw new Error(`updateCard failed: ${res.status}`);
  return res.json();
}

export async function deleteCard(
  deckId: number,
  cardId: number,
): Promise<void> {
  const res = await apiFetch(`/api/decks/${deckId}/cards/${cardId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`deleteCard failed: ${res.status}`);
}

export async function answerCard(
  deckId: number,
  cardId: number,
  correct: boolean,
): Promise<Card> {
  const res = await apiFetch(
    `/api/decks/${deckId}/cards/${cardId}/answer`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ correct }),
    },
  );
  if (!res.ok) throw new Error(`answerCard failed: ${res.status}`);
  return res.json();
}

export async function toggleCardMark(
  deckId: number,
  cardId: number,
  marked: boolean,
): Promise<Card> {
  const res = await apiFetch(
    `/api/decks/${deckId}/cards/${cardId}/mark`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marked }),
    },
  );
  if (!res.ok) throw new Error(`toggleCardMark failed: ${res.status}`);
  return res.json();
}

export async function resetCardStats(
  deckId: number,
  cardId: number,
): Promise<Card> {
  const res = await apiFetch(
    `/api/decks/${deckId}/cards/${cardId}/reset`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
    },
  );
  if (!res.ok) throw new Error(`resetCardStats failed: ${res.status}`);
  return res.json();
}
