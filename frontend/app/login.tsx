import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { C, F, RADIUS, shadow } from "@/src/theme";
import { PrimaryButton } from "@/src/ui";

export default function Login() {
  const insets = useSafeAreaInsets();
  const { loginWithOtp, loginWithGoogle } = useAuth();
  const [step, setStep] = useState<"phone" | "otp" | "done">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(30);
  const [homePath, setHomePath] = useState("/(tabs)");
  const otpRef = useRef<TextInput>(null);

  const valid = phone.length === 10;

  useEffect(() => {
    if (step !== "otp") return;
    setResendIn(30);
    const t = setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [step]);

  const sendOtp = async () => {
    setError(""); setBusy(true);
    try {
      const { api } = await import("@/src/api");
      await api.sendOtp(phone);
      setOtp("");
      setStep("otp");
      setTimeout(() => otpRef.current?.focus(), 350);
    } catch (e: any) {
      setError(e.message || "Could not send OTP");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (code: string) => {
    setBusy(true); setError("");
    try {
      const path = await loginWithOtp(phone, code);
      setHomePath(path);
      setStep("done");
    } catch (e: any) {
      setError("Incorrect code. Try again.");
      setOtp("");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (step === "otp" && otp.length === 6 && !busy) {
      const t = setTimeout(() => verify(otp), 320);
      return () => clearTimeout(t);
    }
  }, [otp, step]); // eslint-disable-line

  const google = async () => {
    setBusy(true); setError("");
    try {
      const path = await loginWithGoogle("ananya.google@gmail.com", "Ananya Sharma");
      setHomePath(path);
      setStep("done");
    } catch (e: any) {
      setError(e.message || "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: C.appBg }}>
      <View style={[styles.root, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
        {/* Brand */}
        <View style={styles.brand}>
          <View style={styles.logoTile}><Text style={styles.logoLetter}>S</Text></View>
          <Text style={styles.wordmark}>Sanjeevan</Text>
          <Text style={styles.tagline}>Care without the waiting room</Text>
        </View>

        {step === "phone" && (
          <View style={{ gap: 16 }}>
            <Text style={styles.title}>Enter your mobile number</Text>
            <Text style={styles.subtitle}>We'll send a 6-digit code to verify it's you.</Text>
            <View style={[styles.phoneRow, valid && { borderColor: C.primary }]}>
              <Text style={styles.prefix}>+91</Text>
              <View style={styles.vdiv} />
              <TextInput
                testID="phone-input"
                style={styles.phoneInput}
                keyboardType="number-pad"
                placeholder="98765 43210"
                placeholderTextColor={C.placeholder}
                maxLength={10}
                value={phone}
                onChangeText={(t) => setPhone(t.replace(/\D/g, "").slice(0, 10))}
              />
              {valid && <Ionicons name="checkmark-circle" size={22} color={C.success} />}
            </View>
            {!!error && <Text style={styles.error}>{error}</Text>}
            <PrimaryButton testID="send-otp-button" title="Continue" disabled={!valid} loading={busy} onPress={sendOtp} />
            <View style={styles.orRow}>
              <View style={styles.hdiv} /><Text style={styles.orText}>OR</Text><View style={styles.hdiv} />
            </View>
            <Pressable testID="google-login-button" onPress={google} style={styles.googleBtn}>
              <Ionicons name="logo-google" size={18} color="#4285F4" />
              <Text style={styles.googleText}>Continue with Google</Text>
            </Pressable>
          </View>
        )}

        {step === "otp" && (
          <View style={{ gap: 16 }}>
            <Text style={styles.title}>Verify your number</Text>
            <Text style={styles.subtitle}>
              Code sent to +91 {phone.slice(0, 5)} {phone.slice(5)}{"  "}
              <Text style={styles.editLink} onPress={() => setStep("phone")}>Edit</Text>
            </Text>
            <Pressable onPress={() => otpRef.current?.focus()} style={styles.otpGrid}>
              {Array.from({ length: 6 }).map((_, i) => {
                const filled = i < otp.length;
                const next = i === otp.length;
                const border = error ? "#FCA5A5" : next ? C.primary : filled ? C.placeholder : C.border;
                return (
                  <View key={i} testID={`otp-cell-${i}`} style={[styles.otpCell, { borderColor: border }]}>
                    <Text style={styles.otpChar}>{otp[i] || ""}</Text>
                  </View>
                );
              })}
              <TextInput
                testID="otp-input"
                ref={otpRef}
                style={styles.otpHidden}
                keyboardType="number-pad"
                maxLength={6}
                value={otp}
                autoFocus
                onChangeText={(t) => { setError(""); setOtp(t.replace(/\D/g, "").slice(0, 6)); }}
              />
            </Pressable>
            <Text style={styles.devHint}>Dev OTP: 123456</Text>
            {!!error && <Text style={styles.error}>{error}</Text>}
            {resendIn > 0 ? (
              <Text style={styles.resend}>Resend code in {resendIn}s</Text>
            ) : (
              <Text testID="resend-otp" style={[styles.resend, { color: C.primary }]} onPress={sendOtp}>Resend code</Text>
            )}
            <Text testID="different-number" style={styles.diffNumber} onPress={() => setStep("phone")}>Use a different number</Text>
          </View>
        )}

        {step === "done" && (
          <View style={{ alignItems: "center", gap: 14 }}>
            <View style={styles.successRing}>
              <Ionicons name="checkmark" size={44} color="#fff" />
            </View>
            <Text style={styles.title}>You're signed in</Text>
            <Text style={styles.subtitle}>Welcome to Sanjeevan. Let's get you to care faster.</Text>
            <PrimaryButton testID="go-to-app-button" title="Continue" onPress={() => router.replace(homePath as any)} style={{ alignSelf: "stretch", marginTop: 8 }} />
          </View>
        )}

        <Text style={styles.legal}>By continuing you agree to Sanjeevan's Terms & Privacy Policy.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24, justifyContent: "space-between" },
  brand: { alignItems: "center", gap: 8, marginBottom: 8 },
  logoTile: { width: 56, height: 56, borderRadius: 16, backgroundColor: C.primary, alignItems: "center", justifyContent: "center", ...shadow("primary") },
  logoLetter: { color: "#fff", fontSize: 30, fontWeight: F.w800 },
  wordmark: { fontSize: 26, fontWeight: F.w800, color: C.ink, letterSpacing: -0.6 },
  tagline: { fontSize: 13, color: C.textSecondary, fontWeight: F.w600 },
  title: { fontSize: 22, fontWeight: F.w800, color: C.ink, letterSpacing: -0.4 },
  subtitle: { fontSize: 13.5, color: C.textSecondary, fontWeight: F.w600, lineHeight: 20 },
  phoneRow: { flexDirection: "row", alignItems: "center", height: 56, borderWidth: 1.5, borderColor: C.border, borderRadius: RADIUS.input, paddingHorizontal: 16, backgroundColor: C.card, gap: 12 },
  prefix: { fontSize: 16, fontWeight: F.w800, color: C.ink },
  vdiv: { width: 1, height: 24, backgroundColor: C.border },
  phoneInput: { flex: 1, fontSize: 17, fontWeight: F.w700, color: C.ink, letterSpacing: 1 },
  error: { color: C.dangerText, fontSize: 13, fontWeight: F.w700 },
  orRow: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 4 },
  hdiv: { flex: 1, height: 1, backgroundColor: C.border },
  orText: { color: C.textTertiary, fontWeight: F.w700, fontSize: 12 },
  googleBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 54, borderRadius: RADIUS.input, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  googleText: { fontSize: 15, fontWeight: F.w800, color: C.ink },
  otpGrid: { flexDirection: "row", gap: 8, position: "relative" },
  otpCell: { flex: 1, aspectRatio: 0.85, maxWidth: 58, borderWidth: 2, borderRadius: RADIUS.chip, alignItems: "center", justifyContent: "center", backgroundColor: C.card },
  otpChar: { fontSize: 24, fontWeight: F.w800, color: C.ink },
  otpHidden: { position: "absolute", width: "100%", height: "100%", opacity: 0 },
  devHint: { fontSize: 12, color: C.textTertiary, fontWeight: F.w600 },
  resend: { fontSize: 13, color: C.textSecondary, fontWeight: F.w700 },
  diffNumber: { fontSize: 13.5, color: C.primary, fontWeight: F.w800 },
  editLink: { color: C.primary, fontWeight: F.w800 },
  successRing: { width: 84, height: 84, borderRadius: 42, backgroundColor: C.success, alignItems: "center", justifyContent: "center", ...shadow("hero") },
  legal: { textAlign: "center", fontSize: 11.5, color: C.textTertiary, fontWeight: F.w600 },
});
