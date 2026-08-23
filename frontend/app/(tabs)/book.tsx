import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { C, F, RADIUS, shadow } from "@/src/theme";
import { Avatar, Card, Chip, StatusPill } from "@/src/ui";

export default function Book() {
  const insets = useSafeAreaInsets();
  const [clinicQuery, setClinicQuery] = useState("");
  const [clinics, setClinics] = useState<any[]>([]);
  const [clinic, setClinic] = useState<any>(null);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [spec, setSpec] = useState("All");
  const [doctors, setDoctors] = useState<any[]>([]);
  const [doctor, setDoctor] = useState<any>(null);
  const [days, setDays] = useState<any[]>([]);
  const [dayIdx, setDayIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [holding, setHolding] = useState("");

  // search clinics (debounced)
  useEffect(() => {
    if (clinic) return;
    const t = setTimeout(async () => {
      try {
        const r = await api.searchClinics(clinicQuery);
        setClinics(r.clinics || []);
      } catch { /* ignore */ }
    }, 250);
    return () => clearTimeout(t);
  }, [clinicQuery, clinic]);

  const selectClinic = async (c: any) => {
    setClinic(c); setLoading(true); setDoctor(null); setDays([]);
    try {
      const s = await api.specialties(c.id);
      setSpecialties(["All", ...(s.specialties || [])]);
      const d = await api.doctors(c.id);
      setDoctors(d.doctors || []);
    } finally { setLoading(false); }
  };

  const filterSpec = async (sp: string) => {
    setSpec(sp); setDoctor(null); setDays([]);
    const d = await api.doctors(clinic.id, sp === "All" ? "" : sp);
    setDoctors(d.doctors || []);
  };

  const selectDoctor = async (doc: any) => {
    setDoctor(doc); setDayIdx(0); setLoading(true);
    try {
      const a = await api.availability(doc.id);
      setDays(a.days || []);
    } finally { setLoading(false); }
  };

  const pickSlot = async (time: string, available: boolean) => {
    if (!available || holding) return;
    setError(""); setHolding(time);
    const date = days[dayIdx].date;
    try {
      const h = await api.hold(doctor.id, date, time);
      router.push({
        pathname: "/payment",
        params: {
          holdId: h.hold_id, doctorName: doctor.name, specialization: doctor.specialization,
          fee: String(doctor.consultation_fee), date, time,
        },
      });
    } catch (e: any) {
      setError(e.status === 409 ? "That slot was just taken. Pick another." : e.message);
    } finally {
      setHolding("");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.appBg }}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.title}>Book appointment</Text>
        {clinic && (
          <Pressable testID="change-clinic" onPress={() => { setClinic(null); setDoctor(null); setDays([]); }}>
            <Text style={styles.changeLink}>Change</Text>
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 100 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {!clinic ? (
          <>
            <View style={styles.search}>
              <Ionicons name="search" size={18} color={C.textTertiary} />
              <TextInput
                testID="clinic-search-input"
                style={styles.searchInput}
                placeholder="Search clinic by name or city"
                placeholderTextColor={C.textTertiary}
                value={clinicQuery}
                onChangeText={setClinicQuery}
                autoCapitalize="words"
              />
            </View>
            <Text style={styles.hint}>Find your Sanjeevan clinic — no codes needed.</Text>
            <View style={{ gap: 12, marginTop: 6 }}>
              {clinics.map((c) => (
                <Pressable key={c.id} testID={`clinic-result-${c.id}`} onPress={() => selectClinic(c)}>
                  <Card>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <Avatar initials="S" bg={C.primaryTintStrong} color={C.primaryOnTint} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.clinicName}>{c.name}</Text>
                        <Text style={styles.clinicCity}>{c.city} · {c.doctor_count} doctors</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={C.placeholder} />
                    </View>
                  </Card>
                </Pressable>
              ))}
              {clinics.length === 0 && <Text style={styles.empty}>No clinics found. Try a different name or city.</Text>}
            </View>
          </>
        ) : (
          <>
            <Card style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Avatar initials="S" bg={C.primaryTintStrong} color={C.primaryOnTint} size={38} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.clinicName}>{clinic.name}</Text>
                  <Text style={styles.clinicCity}>{clinic.city}</Text>
                </View>
              </View>
            </Card>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={{ marginHorizontal: -20 }}>
              {specialties.map((s) => (
                <Chip key={s} testID={`spec-${s}`} label={s} active={s === spec} onPress={() => filterSpec(s)} />
              ))}
            </ScrollView>

            {loading && !doctor && <ActivityIndicator color={C.primary} style={{ marginTop: 20 }} />}

            <View style={{ gap: 12, marginTop: 6 }}>
              {doctors.map((doc) => {
                const selected = doctor?.id === doc.id;
                return (
                  <Card key={doc.id} testID={`doctor-${doc.id}`} style={selected ? { borderColor: C.primary, borderWidth: 1.5 } : undefined}>
                    <View style={{ flexDirection: "row", gap: 12 }}>
                      <Avatar initials={doc.name.replace("Dr. ", "").split(" ").map((x: string) => x[0]).slice(0, 2).join("")} bg={C.primaryTint} color={C.primary} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.docName}>{doc.name}</Text>
                        <Text style={styles.docSpec}>{doc.specialization} · {doc.experience_years} yrs</Text>
                        <View style={{ flexDirection: "row", gap: 12, marginTop: 6, alignItems: "center" }}>
                          <Text style={styles.fee}>₹{doc.consultation_fee}</Text>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                            <Ionicons name="star" size={13} color={C.warning} />
                            <Text style={styles.rating}>{doc.rating}</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                    <View style={styles.docFooter}>
                      <Text style={styles.nextAvail}>Next: today</Text>
                      <Pressable testID={`select-doctor-${doc.id}`} onPress={() => selectDoctor(doc)} style={[styles.selectBtn, selected && { backgroundColor: C.primary }]}>
                        <Text style={[styles.selectBtnText, selected && { color: "#fff" }]}>{selected ? "Selected" : "Select"}</Text>
                      </Pressable>
                    </View>

                    {selected && days.length > 0 && (
                      <View style={{ marginTop: 16 }}>
                        <View style={styles.dayStrip}>
                          {days.map((d, i) => (
                            <Pressable key={d.date} testID={`day-${i}`} onPress={() => setDayIdx(i)} style={[styles.dayCell, i === dayIdx && { backgroundColor: C.primary }]}>
                              <Text style={[styles.dayLabel, i === dayIdx && { color: "rgba(255,255,255,0.8)" }]}>{d.label}</Text>
                              <Text style={[styles.dayNum, i === dayIdx && { color: "#fff" }]}>{d.day}</Text>
                            </Pressable>
                          ))}
                        </View>
                        <View style={styles.slotGrid}>
                          {days[dayIdx].slots.map((s: any) => (
                            <Pressable
                              key={s.time}
                              testID={`slot-${s.time}`}
                              disabled={!s.available}
                              onPress={() => pickSlot(s.time, s.available)}
                              style={[styles.slot, !s.available && styles.slotOff, holding === s.time && { opacity: 0.5 }]}
                            >
                              <Text style={[styles.slotText, !s.available && styles.slotTextOff]}>{s.time}</Text>
                            </Pressable>
                          ))}
                        </View>
                        {!!error && <Text style={styles.error}>{error}</Text>}
                      </View>
                    )}
                  </Card>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 22, fontWeight: F.w800, color: C.ink, letterSpacing: -0.5 },
  changeLink: { color: C.primary, fontWeight: F.w800, fontSize: 14 },
  search: { flexDirection: "row", alignItems: "center", gap: 10, height: 52, backgroundColor: C.card, borderRadius: RADIUS.input, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16 },
  searchInput: { flex: 1, fontSize: 15, fontWeight: F.w600, color: C.ink },
  hint: { fontSize: 12.5, color: C.textTertiary, fontWeight: F.w600, marginTop: 10, marginBottom: 14 },
  clinicName: { fontSize: 15, fontWeight: F.w800, color: C.ink },
  clinicCity: { fontSize: 12.5, color: C.textSecondary, fontWeight: F.w600, marginTop: 2 },
  empty: { textAlign: "center", color: C.textTertiary, fontWeight: F.w600, marginTop: 20 },
  chipRow: { gap: 8, paddingHorizontal: 20, paddingVertical: 4 },
  docName: { fontSize: 15, fontWeight: F.w800, color: C.ink },
  docSpec: { fontSize: 12.5, color: C.textSecondary, fontWeight: F.w600, marginTop: 2 },
  fee: { fontSize: 14, fontWeight: F.w800, color: C.ink },
  rating: { fontSize: 12.5, fontWeight: F.w700, color: C.textSecondary },
  docFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.divider },
  nextAvail: { fontSize: 12.5, color: C.textSecondary, fontWeight: F.w600 },
  selectBtn: { paddingHorizontal: 20, height: 38, borderRadius: RADIUS.pill, backgroundColor: C.appBg, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  selectBtnText: { fontSize: 13, fontWeight: F.w800, color: C.ink },
  dayStrip: { flexDirection: "row", gap: 8 },
  dayCell: { flex: 1, paddingVertical: 10, borderRadius: RADIUS.chip, backgroundColor: C.appBg, alignItems: "center", borderWidth: 1, borderColor: C.border },
  dayLabel: { fontSize: 11, fontWeight: F.w700, color: C.textSecondary },
  dayNum: { fontSize: 16, fontWeight: F.w800, color: C.ink, marginTop: 2 },
  slotGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  slot: { width: "31.5%", flexGrow: 1, paddingVertical: 11, borderRadius: RADIUS.chip, backgroundColor: C.primaryTint, alignItems: "center" },
  slotOff: { backgroundColor: C.appBg },
  slotText: { fontSize: 13, fontWeight: F.w800, color: C.primary },
  slotTextOff: { color: C.placeholder, textDecorationLine: "line-through" },
  error: { color: C.dangerText, fontSize: 13, fontWeight: F.w700, marginTop: 12 },
});
