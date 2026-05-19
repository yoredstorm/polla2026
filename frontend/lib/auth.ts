import api from "./api";
import type { User } from "@/types/api";

export async function getMe(): Promise<User | null> {
  try {
    return await api.get<User>("/users/me");
  } catch {
    return null;
  }
}

export async function login(username: string, password: string) {
  return api.post("/auth/login", { username, password });
}

export async function register(payload: {
  username: string;
  password: string;
  first_name: string;
  last_name: string;
}) {
  return api.post("/auth/register", payload);
}

export async function logout() {
  return api.post("/auth/logout");
}

export async function changePassword(current_password: string, new_password: string) {
  return api.post("/auth/change-password", { current_password, new_password });
}
