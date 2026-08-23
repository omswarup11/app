import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { C, F, RADIUS, shadow } from "@/src/theme";
import { PrimaryButton, StatusPill } from "@/src/ui";

const tone = (s: string) => (s === "in_consultation" ? "primary" : s === "completed" ? "success" : s === "skipped" ? "warning" : "neutral") as any;

export default function Doctor() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [patients, setPatients] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const d = await api.doctorToday(); setPatients(d.patients || []); } catch { /* ignore */ }
  }, []);

  useFocusEffect(useCallback(() => { load(); const t = setInterval(load, 6000); return () => clearInterval(t); }, [load]));

  const callNext = async () => {
    setBusy(true);
    try { await api.queueNext(""); await load(); } finally { setBusy(false); }
  };

  const active = patients.filter((p) => p.status !== "completed");
  const done = patients.filter((p) => p.status === "completed");

  return (
    <View style={{ flex: 1, backgroundColor: C.appBg }}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View>
          <Text style={styles.hTitle}>Today's patients</Text>
          <Text style={styles.hSub}>{user?.name}</Text>
        </View>
        <Pressable testID="doctor-logout" onPress={logout} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="log-out-outline" size={20} color={C.ink} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <PrimaryButton testID="doctor-call-next" title="Call next patient" loading={busy} onPress={callNext} />

        <Text style={styles.sectionH}>Waiting & in consultation</Text>
        {active.length === 0 && <Text style={styles.empty}>No patients waiting right now.</Text>}
        {active.map((p) => (
          <Pressable
            key={p.queue_id}
            testID={`patient-${p.appointment_id || p.queue_id}`}
            disabled={!p.appointment_id}
            onPress={() => p.appointment_id && router.push(`/consultation/${p.appointment_id}`)}
            style={styles.card}
          >
            <View style={styles.tokenBadge}><Text style={styles.tokenText}>{p.token}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{p.patient_name}</Text>
              <Text style={styles.meta}>{[p.age ? `${p.age}y` : null, p.gender, p.reason].filter(Boolean).join(" · ") || "New patient"}</Text>
            </View>
            <StatusPill tone={tone(p.status)} label={p.status.replace("_", " ")} />
          </Pressable>
        ))}

        {done.length > 0 && <Text style={styles.sectionH}>Completed today</Text>}
        {done.map((p) => (
          <View key={p.queue_id} style={[styles.card, { opacity: 0.7 }]}>
            <View style={[styles.tokenBadge, { backgroundColor: C.divider }]}><Text style={[styles.tokenText, { color: C.textSecondary }]}>{p.token}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{p.patient_name}</Text>
              <Text style={styles.meta}>{p.reason || "Consultation complete"}</Text>
            </View>
            <StatusPill tone="success" label="Done" />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  hTitle: { fontSize: 22, fontWeight: F.w800, color: C.ink, letterSpacing: -0.5 },
  hSub: { fontSize: 12.5, color: C.textSecondary, fontWeight: F.w600, marginTop: 2 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  sectionH: { fontSize: 15, fontWeight: F.w800, color: C.ink, marginTop: 22, marginBottom: 12 },
  empty: { color: C.textTertiary, fontWeight: F.w600, fontSize: 13 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.card, borderRadius: RADIUS.card, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 10, ...shadow("card") },
  tokenBadge: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.primaryTint, alignItems: "center", justifyContent: "center" },
  tokenText: { fontSize: 16, fontWeight: F.w800, color: C.primary },
  name: { fontSize: 15, fontWeight: F.w800, color: C.ink },
  meta: { fontSize: 12.5, color: C.textSecondary, fontWeight: F.w600, marginTop: 2 },
});
