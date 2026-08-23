import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { C, F, RADIUS, shadow } from "@/src/theme";
import { Card, Screen, ScreenHeader, Segmented, StatusPill } from "@/src/ui";

const statusTone = (s: string) => (s === "reviewed" ? "success" : s === "new" ? "primary" : "neutral") as any;

export default function Records() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState(params.tab === "prescriptions" ? "prescriptions" : "reports");
  const [reports, setReports] = useState<any[]>([]);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.records(); setReports(r.records || []);
        const p = await api.prescriptions(); setPrescriptions(p.prescriptions || []);
      } catch { /* ignore */ }
    })();
  }, []);

  return (
    <Screen header={<ScreenHeader title="Records" />}>
      <Segmented
        testID="records-tabs"
        value={tab}
        onChange={setTab}
        options={[{ key: "reports", label: "Reports" }, { key: "prescriptions", label: "Prescriptions" }]}
      />

      {tab === "reports" ? (
        <View style={{ gap: 12, marginTop: 16 }}>
          {reports.map((r) => (
            <Card key={r.id} testID={`report-${r.id}`}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <View style={styles.thumb}><Ionicons name="document-text" size={22} color={C.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reportTitle}>{r.title}</Text>
                  <Text style={styles.reportMeta}>{new Date(r.created_at).toLocaleDateString()}</Text>
                  <View style={{ marginTop: 6 }}><StatusPill tone={statusTone(r.status)} label={r.status} /></View>
                </View>
                <Pressable testID={`download-${r.id}`} onPress={() => Linking.openURL(r.url)} style={styles.downloadBtn}>
                  <Ionicons name="download-outline" size={20} color={C.primary} />
                </Pressable>
              </View>
            </Card>
          ))}
          {reports.length === 0 && <Empty label="No reports yet" />}
          <Text style={styles.note}>🔒 Report links are private and expire shortly for your security.</Text>
        </View>
      ) : (
        <View style={{ gap: 14, marginTop: 16 }}>
          {prescriptions.map((p) => (
            <Card key={p.id} testID={`prescription-${p.id}`}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={styles.rxDate}>{new Date(p.created_at).toLocaleDateString()}</Text>
                <Text style={styles.rxDoctor}>{p.doctor}</Text>
              </View>
              <Text style={styles.rxReason}>{p.diagnosis || p.reason}</Text>
              <View style={{ gap: 8, marginTop: 12 }}>
                {p.items.map((m: any, i: number) => (
                  <View key={i} style={styles.medRow}>
                    <View style={styles.rxTile}><Text style={styles.rxTileText}>Rx</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.medName}>{m.name} · {m.dosage}</Text>
                      <Text style={styles.medMeta}>{m.frequency} · {m.duration}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </Card>
          ))}
          {prescriptions.length === 0 && <Empty label="No prescriptions yet" />}
        </View>
      )}
    </Screen>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <View style={{ alignItems: "center", marginTop: 40, gap: 8 }}>
      <Ionicons name="folder-open-outline" size={30} color={C.textTertiary} />
      <Text style={{ color: C.textSecondary, fontWeight: F.w600 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 46, height: 56, borderRadius: 10, backgroundColor: C.primaryTint, alignItems: "center", justifyContent: "center" },
  reportTitle: { fontSize: 14.5, fontWeight: F.w800, color: C.ink },
  reportMeta: { fontSize: 12, color: C.textSecondary, fontWeight: F.w600, marginTop: 2 },
  downloadBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primaryTint, alignItems: "center", justifyContent: "center" },
  note: { fontSize: 11.5, color: C.textTertiary, fontWeight: F.w600, marginTop: 6, textAlign: "center" },
  rxDate: { fontSize: 12.5, color: C.textSecondary, fontWeight: F.w700 },
  rxDoctor: { fontSize: 13, color: C.ink, fontWeight: F.w800 },
  rxReason: { fontSize: 14.5, fontWeight: F.w800, color: C.ink, marginTop: 8 },
  medRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.appBg, borderRadius: RADIUS.chip, padding: 10 },
  rxTile: { width: 34, height: 34, borderRadius: 9, backgroundColor: C.tealTint, alignItems: "center", justifyContent: "center" },
  rxTileText: { color: C.teal, fontWeight: F.w800, fontSize: 13 },
  medName: { fontSize: 13.5, fontWeight: F.w800, color: C.ink },
  medMeta: { fontSize: 12, color: C.textSecondary, fontWeight: F.w600, marginTop: 1 },
});
