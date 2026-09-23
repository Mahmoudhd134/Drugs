import axios from "axios";

// In production the SPA is served from the same origin as the API
// (ASP.NET Core wwwroot), so a relative URL works on any host/port.
// In development the API runs on its own port, so override the base URL
// via VITE_API_BASE_URL in .env.development.
const baseURL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

export default axios.create({
    baseURL,
    headers: {
        "Content-Type": "application/json",
    },
});
