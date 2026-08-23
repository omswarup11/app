import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { C, F, RADIUS, shadow } from "@/src/theme";
import { Chip, PrimaryButton } from "@/src/ui";

export default function Reception() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [doctors, setDoctors] = useState<any[]>([]);
  const [doctorId, setDoctorId] = useState("");
  const [snap, setSnap] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", reason: "" });
  const [saving, setSaving] = useState(false);
  const [walkErr, setWalkErr] = useState("");
  const poll = useRef<any>(null);

  useEffect(() => {
    (async () => {
      const d = await api.staffDoctors();
      setDoctors(d.doctors || []);
      if (d.doctors?.[0]) setDoctorId(d.doctors[0].id);
    })();
  }, []);

  const refresh = useCallback(async (id: string) => {
    if (!id) return;
    try { setSnap(await api.staffQueue(id)); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!doctorId) return;
    refresh(doctorId);
    poll.current = setInterval(() => refresh(doctorId), 5000);
    return () => clearInterval(poll.current);
  }, [doctorId, refresh]);

  const act = async (fn: () => Promise<any>) => {
    setLoading(true);
    try { const r = await fn(); if (r?.snapshot) setSnap(r.snapshot); else await refresh(doctorId); }
    finally { setLoading(false); }
  };

  const submitWalkIn = async () => {
    if (!form.name.trim()) return;
    setSaving(true); setWalkErr("");
    try {
      const r = await api.walkIn({ doctor_id: doctorId, patient_name: form.name.trim(), phone: form.phone.trim() || undefined, reason: form.reason.trim() });
      if (r?.snapshot) setSnap(r.snapshot);
      setForm({ name: "", phone: "", reason: "" });
      setModal(false);
    } catch (e: any) {
      setWalkErr(e.message || "Could not add walk-in. Please retry.");
    } finally { setSaving(false); }
  };

  const waiting = snap?.waiting || [];

  return (
    <View style={{ flex: 1, backgroundColor: C.appBg }}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View>
          <Text style={styles.hTitle}>Reception</Text>
          <Text style={styles.hSub}>{user?.name} · Queue console</Text>
        </View>
        <Pressable testID="reception-logout" onPress={logout} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="log-out-outline" size={20} color={C.ink} />
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={{ maxHeight: 60 }}>
        {doctors.map((d) => (
          <Chip key={d.id} testID={`recep-doc-${d.id}`} label={d.name.replace("Dr. ", "")} active={d.id === doctorId} onPress={() => setDoctorId(d.id)} />
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 120 }} showsVerticalScrollIndicator={false}>
        <View style={styles.serving}>
          <Text style={styles.servingLabel}>NOW SERVING</Text>
          <Text style={styles.servingNum}>{snap?.now_serving ?? 0}</Text>
          <Text style={styles.servingSub}>{waiting.filter((e: any) => e.status === "waiting").length} waiting</Text>
        </View>

        <PrimaryButton testID="call-next-button" title="Call next patient" loading={loading} onPress={() => act(() => api.queueNext(doctorId))} style={{ marginTop: 16 }} />

        <Text style={styles.sectionH}>In queue</Text>
        {waiting.length === 0 && <Text style={styles.empty}>Queue is empty. Add a walk-in to get started.</Text>}
        {waiting.map((e: any) => (
          <View key={e.id} testID={`queue-row-${e.id}`} style={styles.row}>
            <View style={[styles.tokenBadge, e.status === "in_consultation" && { backgroundColor: C.primary }]}>
              <Text style={[styles.tokenBadgeText, e.status === "in_consultation" && { color: "#fff" }]}>{e.token_number}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName}>{e.patient_name}</Text>
              <Text style={styles.rowStatus}>{e.status.replace("_", " ")}</Text>
            </View>
            <Pressable testID={`skip-${e.id}`} onPress={() => act(() => api.queueSkip(e.id))} style={[styles.smallBtn, { backgroundColor: C.warningBg }]}>
              <Text style={[styles.smallBtnText, { color: C.warningText }]}>Skip</Text>
            </Pressable>
            <Pressable testID={`complete-${e.id}`} onPress={() => act(() => api.queueComplete(e.id))} style={[styles.smallBtn, { backgroundColor: C.successBg }]}>
              <Text style={[styles.smallBtnText, { color: C.successText }]}>Done</Text>
            </Pressable>
          </View>
        ))}

        <Text style={styles.sectionH}>Recent activity</Text>
        {(snap?.events || []).map((ev: any, i: number) => (
          <View key={i} style={styles.eventRow}>
            <View style={styles.eventDot} />
            <Text style={styles.eventMsg}>{ev.message}</Text>
          </View>
        ))}
      </ScrollView>

      <Pressable testID="add-walkin-fab" onPress={() => setModal(true)} style={[styles.fab, { bottom: insets.bottom + 20 }]}>
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={styles.fabText}>Add walk-in</Text>
      </Pressable>

      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Add walk-in patient</Text>
            <Text style={styles.inputLabel}>Patient name</Text>
            <TextInput testID="walkin-name" style={styles.input} placeholder="Full name" placeholderTextColor={C.placeholder} value={form.name} onChangeText={(t) => setForm({ ...form, name: t })} />
            <Text style={styles.inputLabel}>Phone (optional)</Text>
            <TextInput testID="walkin-phone" style={styles.input} placeholder="10-digit mobile" placeholderTextColor={C.placeholder} keyboardType="number-pad" maxLength={10} value={form.phone} onChangeText={(t) => setForm({ ...form, phone: t.replace(/\D/g, "") })} />
            <Text style={styles.inputLabel}>Reason (optional)</Text>
            <TextInput testID="walkin-reason" style={styles.input} placeholder="e.g. Fever, follow-up" placeholderTextColor={C.placeholder} value={form.reason} onChangeText={(t) => setForm({ ...form, reason: t })} />
            {!!walkErr && <Text testID="walkin-error" style={{ color: C.dangerText, fontSize: 13, fontWeight: F.w700, marginTop: 10 }}>{walkErr}</Text>}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable onPress={() => setModal(false)} style={styles.cancelBtn}><Text style={styles.cancelText}>Cancel</Text></Pressable>
              <PrimaryButton testID="walkin-submit" title="Add & generate token" loading={saving} onPress={submitWalkIn} style={{ flex: 1 }} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  hTitle: { fontSize: 22, fontWeight: F.w800, color: C.ink, letterSpacing: -0.5 },
  hSub: { fontSize: 12.5, color: C.textSecondary, fontWeight: F.w600, marginTop: 2 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  chipRow: { gap: 8, paddingHorizontal: 20, paddingVertical: 8 },
  serving: { backgroundColor: C.card, borderRadius: RADIUS.card, borderWidth: 1, borderColor: C.border, paddingVertical: 22, alignItems: "center", ...shadow("card") },
  servingLabel: { fontSize: 11, fontWeight: F.w800, color: C.textTertiary, letterSpacing: 0.6 },
  servingNum: { fontSize: 60, fontWeight: F.w800, color: C.ink, letterSpacing: -2, lineHeight: 66, fontVariant: ["tabular-nums"] },
  servingSub: { fontSize: 13, color: C.textSecondary, fontWeight: F.w700 },
  sectionH: { fontSize: 15, fontWeight: F.w800, color: C.ink, marginTop: 22, marginBottom: 12 },
  empty: { color: C.textTertiary, fontWeight: F.w600, fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.card, borderRadius: RADIUS.card, borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 10, ...shadow("card") },
  tokenBadge: { width: 42, height: 42, borderRadius: 12, backgroundColor: C.primaryTint, alignItems: "center", justifyContent: "center" },
  tokenBadgeText: { fontSize: 16, fontWeight: F.w800, color: C.primary },
  rowName: { fontSize: 14.5, fontWeight: F.w800, color: C.ink },
  rowStatus: { fontSize: 12, color: C.textSecondary, fontWeight: F.w600, textTransform: "capitalize", marginTop: 1 },
  smallBtn: { paddingHorizontal: 12, height: 34, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  smallBtnText: { fontSize: 12.5, fontWeight: F.w800 },
  eventRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  eventDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.placeholder },
  eventMsg: { fontSize: 12.5, color: C.textSecondary, fontWeight: F.w600 },
  fab: { position: "absolute", right: 20, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.primary, paddingHorizontal: 18, height: 52, borderRadius: RADIUS.pill, ...shadow("primary") },
  fabText: { color: "#fff", fontWeight: F.w800, fontSize: 14.5 },
  modalWrap: { flex: 1, backgroundColor: "rgba(17,24,39,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet, padding: 20 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: "center", marginBottom: 14 },
  sheetTitle: { fontSize: 18, fontWeight: F.w800, color: C.ink, marginBottom: 14 },
  inputLabel: { fontSize: 12, fontWeight: F.w800, color: C.textSecondary, marginBottom: 6, marginTop: 10 },
  input: { height: 50, borderWidth: 1, borderColor: C.border, borderRadius: RADIUS.input, paddingHorizontal: 14, fontSize: 15, fontWeight: F.w600, color: C.ink, backgroundColor: C.appBg },
  cancelBtn: { height: 54, paddingHorizontal: 20, borderRadius: RADIUS.input, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  cancelText: { fontSize: 14.5, fontWeight: F.w800, color: C.textSecondary },
});
