import { getAccessToken, refresh } from "../services/authService";


export async function authHeader() {
let token = await getAccessToken();
if (!token) return {};
// Optionally: try a lightweight verify by calling your backend or decoding expiry and refresh if needed.
return { Authorization: `Bearer ${token}` };
}


export async function withAuth(config = {}) {
return { ...(config || {}), headers: { ...(config.headers || {}), ...(await authHeader()) } };
}