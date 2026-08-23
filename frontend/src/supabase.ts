import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { makeRedirectUri } from "expo-auth-session";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

export const SUPABASE_ENABLED = !!(URL && ANON);
export const USE_SUPABASE_PHONE = process.env.EXPO_PUBLIC_USE_SUPABASE_PHONE === "true";

export const supabase = createClient(URL || "https://placeholder.supabase.co", ANON || "placeholder", {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export function redirectUri() {
  return makeRedirectUri({ scheme: "frontend", path: "oauth/callback" });
}

export async function supabaseSendPhoneOtp(phoneE164: string) {
  const { error } = await supabase.auth.signInWithOtp({ phone: phoneE164, options: { shouldCreateUser: true } });
  if (error) throw error;
}

export async function supabaseVerifyPhoneOtp(phoneE164: string, token: string) {
  const { data, error } = await supabase.auth.verifyOtp({ phone: phoneE164, token: token.trim(), type: "sms" });
  if (error) throw error;
  if (!data.session) throw new Error("No session returned");
  return data.session.access_token;
}

function parseCallback(url: string) {
  const parsed = Linking.parse(url);
  const q = parsed.queryParams ?? {};
  const hash = url.split("#")[1] ?? "";
  const hp = new URLSearchParams(hash);
  return {
    code: typeof q.code === "string" ? q.code : undefined,
    access_token: (typeof q.access_token === "string" ? q.access_token : hp.get("access_token")) || undefined,
    refresh_token: (typeof q.refresh_token === "string" ? q.refresh_token : hp.get("refresh_token")) || undefined,
  };
}

export async function supabaseGoogle(): Promise<string> {
  const redirectTo = redirectUri();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error("No OAuth URL from Supabase");
  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== "success") throw new Error(`Sign-in ${res.type}`);
  const p = parseCallback(res.url);
  if (p.code) {
    const ex = await supabase.auth.exchangeCodeForSession(p.code);
    if (ex.error) throw ex.error;
    return ex.data.session!.access_token;
  }
  if (p.access_token && p.refresh_token) {
    const s = await supabase.auth.setSession({ access_token: p.access_token, refresh_token: p.refresh_token });
    if (s.error) throw s.error;
    return s.data.session!.access_token;
  }
  throw new Error("OAuth callback missing code/tokens");
}
