const envs = import.meta.env;

export default {
  baseApiUrl: envs.VITE_BASE_API_URL,
};