import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { C, F, RADIUS, shadow } from "@/src/theme";
import { useQueue } from "@/src/useQueue";
import { Card, Screen, ScreenHeader, StatusPill } from "@/src/ui";

export default function Queue() {
  const { data: q, connected } = useQueue(true);

  const header = (
    <ScreenHeader
      title="Live queue"
      right={
        <View style={[styles.connPill, { backgroundColor: connected ? C.successBg : C.divider }]}>
          <View style={[styles.connDot, { backgroundColor: connected ? C.success : C.textTertiary }]} />
          <Text style={[styles.connText, { color: connected ? C.successText : C.textSecondary }]}>
            {connected ? "Live" : "Offline"}
          </Text>
        </View>
      }
    />
  );

  if (!q?.in_queue) {
    return (
      <Screen header={header}>
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><Ionicons name="people-outline" size={30} color={C.textTertiary} /></View>
          <Text style={styles.emptyTitle}>You're not in a queue right now</Text>
          <Text style={styles.emptySub}>Book an appointment and your live token will appear here.</Text>
        </View>
      </Screen>
    );
  }

  const served = q.now_serving ?? 0;
  const myTok = q.my_token ?? 0;
  const progress = myTok > 0 ? Math.min(1, served / myTok) : 0;

  return (
    <Screen header={header}>
      <View style={styles.servingWrap}>
        <Text style={styles.servingLabel}>NOW SERVING</Text>
        <Text testID="now-serving" style={styles.servingNum}>{served}</Text>
        <View style={styles.tokenPill}>
          <Text style={styles.tokenPillText}>Your token · {myTok}</Text>
        </View>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress * 100}%` }]} /></View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{q.people_ahead ?? 0}</Text>
          <Text style={styles.statLabel}>People ahead</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>~{q.estimated_wait_mins ?? 0}m</Text>
          <Text style={styles.statLabel}>Estimated wait</Text>
        </View>
      </View>

      <Card style={{ marginTop: 16 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text style={styles.docName}>{q.doctor?.name}</Text>
            <Text style={styles.docSpec}>{q.doctor?.specialization}</Text>
          </View>
          <StatusPill tone="success" label="In clinic" />
        </View>
      </Card>

      <Text style={styles.timelineH}>Queue activity</Text>
      <Card style={{ padding: 0 }}>
        {(q.events || []).length === 0 && <Text style={styles.noEvents}>No updates yet. Hang tight — we'll notify you.</Text>}
        {(q.events || []).map((e, i) => (
          <View key={i} style={[styles.eventRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.divider }]}>
            <View style={[styles.eventDot, { backgroundColor: i === 0 ? C.primary : C.placeholder }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.eventMsg}>{e.message}</Text>
              <Text style={styles.eventTime}>{new Date(e.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
            </View>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  connPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.pill },
  connDot: { width: 7, height: 7, borderRadius: 4 },
  connText: { fontSize: 11, fontWeight: F.w800 },
  empty: { alignItems: "center", marginTop: 80, gap: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.divider, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 17, fontWeight: F.w800, color: C.ink },
  emptySub: { fontSize: 13, color: C.textSecondary, fontWeight: F.w600, textAlign: "center", paddingHorizontal: 30 },
  servingWrap: { alignItems: "center", backgroundColor: C.card, borderRadius: RADIUS.hero, borderWidth: 1, borderColor: C.border, paddingVertical: 26, ...shadow("card") },
  servingLabel: { fontSize: 11.5, fontWeight: F.w800, color: C.textTertiary, letterSpacing: 0.8 },
  servingNum: { fontSize: 86, fontWeight: F.w800, color: C.ink, letterSpacing: -4, lineHeight: 96, fontVariant: ["tabular-nums"] },
  tokenPill: { backgroundColor: C.primaryTintStrong, paddingHorizontal: 16, paddingVertical: 7, borderRadius: RADIUS.pill, marginTop: 4 },
  tokenPillText: { color: C.primaryOnTint, fontWeight: F.w800, fontSize: 13.5 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: C.divider, width: "80%", marginTop: 18, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: C.primary },
  statsRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: RADIUS.card, borderWidth: 1, borderColor: C.border, padding: 18, marginTop: 16, ...shadow("card") },
  stat: { flex: 1, alignItems: "center" },
  statDivider: { width: 1, height: 40, backgroundColor: C.divider },
  statValue: { fontSize: 26, fontWeight: F.w800, color: C.ink, letterSpacing: -1 },
  statLabel: { fontSize: 12, color: C.textSecondary, fontWeight: F.w600, marginTop: 4 },
  docName: { fontSize: 15, fontWeight: F.w800, color: C.ink },
  docSpec: { fontSize: 12.5, color: C.textSecondary, fontWeight: F.w600, marginTop: 2 },
  timelineH: { fontSize: 15, fontWeight: F.w800, color: C.ink, marginTop: 22, marginBottom: 12 },
  noEvents: { padding: 18, textAlign: "center", color: C.textTertiary, fontWeight: F.w600, fontSize: 13 },
  eventRow: { flexDirection: "row", gap: 12, padding: 16, alignItems: "flex-start" },
  eventDot: { width: 10, height: 10, borderRadius: 5, marginTop: 3 },
  eventMsg: { fontSize: 13.5, fontWeight: F.w700, color: C.ink },
  eventTime: { fontSize: 11.5, color: C.textTertiary, fontWeight: F.w600, marginTop: 2 },
});
