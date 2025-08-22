import api from "../lib/api";

/**
 * Fetch all snippets for the logged-in user.
 */
export async function fetchSnippets() {
  try {
    const { data } = await api.get("/api/snippets");
    return data;
  } catch (e) {
    throw new Error(e?.response?.data?.message || "Failed to fetch snippets");
  }
}

/**
 * Create a new snippet (language, code[, title])
 * @param {{language: string, code: string, title?: string}} body
 */
export async function createSnippet(body) {
  try {
    const { data } = await api.post("/api/snippets", body);
    return data;
  } catch (e) {
    throw new Error(e?.response?.data?.message || "Failed to create snippet");
  }
}

/**
 * Delete a snippet by id
 */
export async function deleteSnippet(id) {
  try {
    const { data } = await api.delete(`/api/snippets/${id}`);
    return data;
  } catch (e) {
    throw new Error(e?.response?.data?.message || "Failed to delete snippet");
  }
}

/**
 * Rename/update title (requires PATCH route on server)
 */
export async function updateSnippetTitle(id, title) {
  try {
    const { data } = await api.patch(`/api/snippets/${id}`, { title });
    return data;
  } catch (e) {
    throw new Error(e?.response?.data?.message || "Failed to rename snippet");
  }
}
