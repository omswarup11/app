import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { C, F, RADIUS, shadow } from "@/src/theme";
import { useQueue } from "@/src/useQueue";
import { Avatar, Card, Screen, SecondaryButton, StatusPill } from "@/src/ui";

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

const initials = (name: string) =>
  name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "P";

export default function Home() {
  const { user } = useAuth();
  const { data: q } = useQueue(true);
  const [appt, setAppt] = useState<any>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const a = await api.appointments();
        const up = (a.appointments || []).find((x: any) => x.status === "confirmed");
        setAppt(up || null);
        const r = await api.records();
        setReports((r.records || []).slice(0, 2));
        const n = await api.notifications();
        setUnread(n.unread || 0);
      } catch { /* ignore */ }
    })();
  }, []);

  const served = q?.now_serving || 0;
  const myTok = q?.my_token || 0;
  const progress = myTok > 0 ? Math.min(1, served / myTok) : 0;

  return (
    <Screen>
      {/* greeting */}
      <View style={styles.greetRow}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Avatar initials={initials(user?.name || "P")} />
          <View>
            <Text style={styles.greetHi}>{greeting()}</Text>
            <Text style={styles.greetName}>{user?.name || "Patient"}</Text>
          </View>
        </View>
        <Pressable testID="notifications-bell" style={styles.bell}>
          <Ionicons name="notifications-outline" size={22} color={C.ink} />
          {unread > 0 && <View style={styles.bellDot} />}
        </Pressable>
      </View>

      {/* live token hero */}
      {q?.in_queue && (
        <View testID="home-token-card" style={styles.hero}>
          <View style={styles.heroTop}>
            <Text style={styles.heroLabel}>YOUR TOKEN</Text>
            <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveText}>Live</Text></View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 14 }}>
            <Text style={styles.heroToken}>{myTok}</Text>
            <Text style={styles.heroServing}>Now serving{"\n"}<Text style={{ fontWeight: F.w800, fontSize: 18 }}>{served}</Text></Text>
          </View>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress * 100}%` }]} /></View>
          <View style={styles.heroStatsRow}>
            <Text style={styles.heroStat}>{q?.people_ahead ?? 0} ahead</Text>
            <Text style={styles.heroStat}>~{q?.estimated_wait_mins ?? 0} min wait</Text>
          </View>
          <Pressable testID="track-live-button" style={styles.trackBtn} onPress={() => router.push("/(tabs)/queue")}>
            <Text style={styles.trackBtnText}>Track live</Text>
          </Pressable>
        </View>
      )}

      {/* upcoming appointment */}
      {appt && (
        <Card testID="upcoming-appointment-card" style={{ marginTop: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={styles.cardTitle}>Upcoming appointment</Text>
            <StatusPill tone="success" label="In clinic" />
          </View>
          <View style={styles.docRow}>
            <Avatar initials="DR" bg={C.primaryTint} color={C.primary} size={40} />
            <View>
              <Text style={styles.docName}>{appt.doctor?.name || "Doctor"}</Text>
              <Text style={styles.docSpec}>{appt.doctor?.specialization || ""}</Text>
            </View>
          </View>
          <View style={styles.tileRow}>
            <View style={styles.tile}><Text style={styles.tileLabel}>WHEN</Text><Text style={styles.tileValue}>{appt.appointment_time}</Text></View>
            <View style={styles.tile}><Text style={styles.tileLabel}>FEE</Text><Text style={styles.tileValue}>₹{appt.consultation_fee}</Text></View>
          </View>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
            <SecondaryButton title="Reschedule" onPress={() => router.push("/(tabs)/book")} style={{ flex: 1 }} />
            <SecondaryButton title="View queue" dark onPress={() => router.push("/(tabs)/queue")} style={{ flex: 1 }} />
          </View>
        </Card>
      )}

      {/* quick actions */}
      <Text style={[styles.sectionH, { marginTop: 22 }]}>Quick actions</Text>
      <View style={styles.grid}>
        <QuickAction icon="calendar" label="Book" sub="New appointment" onPress={() => router.push("/(tabs)/book")} testID="qa-book" />
        <QuickAction icon="document-text" label="Reports" sub="Lab & scans" onPress={() => router.push("/(tabs)/records")} testID="qa-reports" />
        <QuickAction icon="medkit" label="Prescriptions" sub="Medicines" onPress={() => router.push({ pathname: "/(tabs)/records", params: { tab: "prescriptions" } })} testID="qa-prescriptions" />
        <QuickAction icon="pulse" label="Live queue" sub="Track token" onPress={() => router.push("/(tabs)/queue")} testID="qa-queue" />
      </View>

      {/* recent reports */}
      {reports.length > 0 && (
        <>
          <Text style={[styles.sectionH, { marginTop: 22 }]}>Recent reports</Text>
          <Card style={{ padding: 0 }}>
            {reports.map((r, i) => (
              <View key={r.id} style={[styles.reportRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.divider }]}>
                <View style={styles.fileIcon}><Ionicons name="document-text" size={18} color={C.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reportTitle}>{r.title}</Text>
                  <Text style={styles.reportMeta}>{r.status}</Text>
                </View>
                <Text style={styles.openLink}>Open</Text>
              </View>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}

function QuickAction({ icon, label, sub, onPress, testID }: any) {
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.qa, pressed && { transform: [{ translateY: -2 }] }]}>
      <View style={styles.qaIcon}><Ionicons name={icon} size={20} color={C.primary} /></View>
      <Text style={styles.qaLabel}>{label}</Text>
      <Text style={styles.qaSub}>{sub}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  greetRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  greetHi: { fontSize: 13, color: C.textSecondary, fontWeight: F.w600 },
  greetName: { fontSize: 18, color: C.ink, fontWeight: F.w800, letterSpacing: -0.3 },
  bell: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  bellDot: { position: "absolute", top: 11, right: 12, width: 8, height: 8, borderRadius: 4, backgroundColor: C.danger, borderWidth: 1.5, borderColor: C.card },
  hero: { backgroundColor: C.primary, borderRadius: RADIUS.hero, padding: 22, marginTop: 18, ...shadow("hero") },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  heroLabel: { color: "rgba(255,255,255,0.7)", fontSize: 11.5, fontWeight: F.w800, letterSpacing: 0.6 },
  livePill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.18)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#86EFAC" },
  liveText: { color: "#fff", fontSize: 11, fontWeight: F.w800 },
  heroToken: { color: "#fff", fontSize: 56, fontWeight: F.w800, letterSpacing: -2, fontVariant: ["tabular-nums"] },
  heroServing: { color: "rgba(255,255,255,0.78)", fontSize: 12.5, fontWeight: F.w600, marginBottom: 10 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.22)", marginTop: 14, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: "#fff" },
  heroStatsRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 },
  heroStat: { color: "#fff", fontSize: 13, fontWeight: F.w700 },
  trackBtn: { backgroundColor: "#fff", height: 44, borderRadius: RADIUS.input, alignItems: "center", justifyContent: "center", marginTop: 16 },
  trackBtnText: { color: C.primary, fontSize: 14.5, fontWeight: F.w800 },
  cardTitle: { fontSize: 16, fontWeight: F.w800, color: C.ink },
  docRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14 },
  docName: { fontSize: 14.5, fontWeight: F.w800, color: C.ink },
  docSpec: { fontSize: 12.5, color: C.textSecondary, fontWeight: F.w600 },
  tileRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  tile: { flex: 1, backgroundColor: C.appBg, borderRadius: RADIUS.chip, padding: 12 },
  tileLabel: { fontSize: 10.5, fontWeight: F.w800, color: C.textTertiary, letterSpacing: 0.5 },
  tileValue: { fontSize: 15, fontWeight: F.w800, color: C.ink, marginTop: 3 },
  sectionH: { fontSize: 15, fontWeight: F.w800, color: C.ink, marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  qa: { width: "47.5%", flexGrow: 1, backgroundColor: C.card, borderRadius: RADIUS.card, borderWidth: 1, borderColor: C.border, padding: 16, ...shadow("card") },
  qaIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: C.primaryTint, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  qaLabel: { fontSize: 14.5, fontWeight: F.w800, color: C.ink },
  qaSub: { fontSize: 12, color: C.textSecondary, fontWeight: F.w600, marginTop: 2 },
  reportRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  fileIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.primaryTint, alignItems: "center", justifyContent: "center" },
  reportTitle: { fontSize: 14, fontWeight: F.w800, color: C.ink },
  reportMeta: { fontSize: 12, color: C.textSecondary, fontWeight: F.w600, textTransform: "capitalize" },
  openLink: { fontSize: 13, fontWeight: F.w800, color: C.primary },
});
