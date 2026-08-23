import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { C, F, RADIUS, shadow } from "@/src/theme";
import { PrimaryButton, SecondaryButton } from "@/src/ui";

export default function Confirmation() {
  const insets = useSafeAreaInsets();
  const p = useLocalSearchParams<{ doctorName: string; date: string; time: string; token: string; amount: string; reference: string; method: string }>();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
      <View style={{ alignItems: "center", gap: 12 }}>
        <View style={styles.ring}><Ionicons name="checkmark" size={48} color="#fff" /></View>
        <Text style={styles.title}>Appointment confirmed</Text>
        <Text style={styles.subtitle}>Your booking is secured. See you at the clinic.</Text>
      </View>

      <View style={styles.ticket}>
        <View style={styles.ticketHead}>
          <Text style={styles.ticketDoctor}>{p.doctorName}</Text>
          <Text style={styles.ticketMeta}>Consultation</Text>
        </View>
        <View style={styles.grid}>
          <Cell label="Date" value={p.date} />
          <Cell label="Time" value={p.time} />
          <Cell label="Digital token" value={`#${p.token}`} highlight />
          <Cell label="Est. wait" value="~20 min" />
        </View>
        <View style={styles.paidRow}>
          <Ionicons name="checkmark-circle" size={16} color={C.successText} />
          <Text style={styles.paidText}>Paid ₹{p.amount} · {String(p.method || "UPI").toUpperCase()}</Text>
          {!!p.reference && <Text style={styles.reference}>{p.reference}</Text>}
        </View>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
          <SecondaryButton title="Download" onPress={() => {}} style={{ flex: 1 }} />
          <SecondaryButton title="Share" onPress={() => {}} style={{ flex: 1 }} />
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <PrimaryButton testID="track-queue-button" title="Track live queue" onPress={() => router.replace("/(tabs)/queue")} />
        <SecondaryButton testID="back-home-button" title="Back to home" onPress={() => router.replace("/(tabs)")} />
      </View>
    </View>
  );
}

function Cell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={[styles.cellValue, highlight && { color: C.primary }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.appBg, paddingHorizontal: 24, justifyContent: "space-between" },
  ring: { width: 88, height: 88, borderRadius: 44, backgroundColor: C.success, alignItems: "center", justifyContent: "center", ...shadow("hero") },
  title: { fontSize: 23, fontWeight: F.w800, color: C.ink, letterSpacing: -0.5 },
  subtitle: { fontSize: 13.5, color: C.textSecondary, fontWeight: F.w600, textAlign: "center" },
  ticket: { backgroundColor: C.card, borderRadius: RADIUS.hero, borderWidth: 1, borderColor: C.border, padding: 20, ...shadow("card") },
  ticketHead: { marginBottom: 16 },
  ticketDoctor: { fontSize: 17, fontWeight: F.w800, color: C.ink },
  ticketMeta: { fontSize: 12.5, color: C.textSecondary, fontWeight: F.w600, marginTop: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  cell: { width: "46%", flexGrow: 1, backgroundColor: C.appBg, borderRadius: RADIUS.chip, padding: 14 },
  cellLabel: { fontSize: 10.5, fontWeight: F.w800, color: C.textTertiary, letterSpacing: 0.5 },
  cellValue: { fontSize: 16, fontWeight: F.w800, color: C.ink, marginTop: 4 },
  paidRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.successSoft, borderRadius: RADIUS.chip, padding: 12, marginTop: 16, flexWrap: "wrap" },
  paidText: { fontSize: 13, fontWeight: F.w800, color: C.successText },
  reference: { fontSize: 11.5, color: C.successText, fontWeight: F.w600, marginLeft: "auto" },
});
