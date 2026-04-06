const API_BASE = 'https://api.supermemory.ai/v3';

function getHeaders() {
  return {
    'Authorization': `Bearer ${process.env.SUPERMEMORY_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

export async function addMemory(
  userId: string,
  content: string,
  metadata: Record<string, unknown> = {}
): Promise<{ id: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/documents`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        content,
        metadata: { userId, ...metadata },
      }),
    });

    if (!res.ok) {
      console.error('Supermemory addMemory failed:', res.status, await res.text());
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error('Supermemory addMemory error:', err);
    return null;
  }
}

export async function searchMemory(
  userId: string,
  query: string,
  limit = 5
): Promise<{ id: string; content: string; score: number }[]> {
  try {
    const res = await fetch(`${API_BASE}/documents/search`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        query,
        filters: { metadata: { userId } },
        limit,
      }),
    });

    if (!res.ok) {
      console.error('Supermemory search failed:', res.status);
      return [];
    }

    const data = await res.json();
    return (data.results || []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      content: r.content as string,
      score: r.score as number,
    }));
  } catch (err) {
    console.error('Supermemory search error:', err);
    return [];
  }
}

export async function updateMemory(
  memoryId: string,
  content: string
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/documents/${memoryId}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ content }),
    });

    return res.ok;
  } catch (err) {
    console.error('Supermemory update error:', err);
    return false;
  }
}

export async function deleteMemory(memoryId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/documents/${memoryId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });

    return res.ok;
  } catch (err) {
    console.error('Supermemory delete error:', err);
    return false;
  }
}
