import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { C, F, RADIUS, shadow } from "@/src/theme";
import { Chip, PrimaryButton, SecondaryButton, StatusPill } from "@/src/ui";

const LAB_PRESETS = ["CBC", "Chest X-Ray", "Lipid Profile", "Blood Sugar", "Thyroid (TSH)", "Urine Routine"];
const emptyMed = () => ({ name: "", dosage: "", frequency: "", duration: "", instructions: "" });

export default function Consultation() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [vitals, setVitals] = useState({ bp: "", temp: "", pulse: "" });
  const [fields, setFields] = useState({ chief_complaint: "", clinical_notes: "", diagnosis: "", instructions: "" });
  const [medicines, setMedicines] = useState<any[]>([emptyMed()]);
  const [labs, setLabs] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      const d = await api.getConsultation(id);
      setData(d);
      setDone(d.appointment.status === "completed");
      if (d.consultation) {
        setFields({
          chief_complaint: d.consultation.chief_complaint || "",
          clinical_notes: d.consultation.clinical_notes || "",
          diagnosis: d.consultation.diagnosis || "",
          instructions: d.consultation.instructions || "",
        });
        setVitals({ bp: d.consultation.vitals?.bp || "", temp: d.consultation.vitals?.temp || "", pulse: d.consultation.vitals?.pulse || "" });
      }
      if (d.medicines?.length) setMedicines(d.medicines);
      if (d.lab_orders?.length) setLabs(d.lab_orders.map((l: any) => l.name));
    })();
  }, [id]);

  const setMed = (i: number, k: string, v: string) =>
    setMedicines((m) => m.map((x, idx) => (idx === i ? { ...x, [k]: v } : x)));
  const removeMed = (i: number) => setMedicines((m) => m.filter((_, idx) => idx !== i));
  const toggleLab = (name: string) => setLabs((l) => (l.includes(name) ? l.filter((x) => x !== name) : [...l, name]));

  const payload = () => ({
    ...fields,
    vitals,
    medicines: medicines.filter((m) => m.name.trim()),
    lab_orders: labs,
  });

  const saveDraft = async () => {
    setSaving(true);
    try { await api.saveConsultation(id, { ...fields, vitals }); } finally { setSaving(false); }
  };

  const complete = async () => {
    setSaving(true);
    try { await api.completeConsultation(id, payload()); router.back(); }
    finally { setSaving(false); }
  };

  if (!data) {
    return <View style={{ flex: 1, backgroundColor: C.appBg, justifyContent: "center" }}><ActivityIndicator color={C.primary} /></View>;
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: C.appBg }}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable testID="consult-back" onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={C.ink} />
        </Pressable>
        <Text style={styles.hTitle}>Consultation</Text>
        {done ? <StatusPill tone="success" label="Completed" /> : <View style={{ width: 38 }} />}
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* patient */}
        <View style={styles.patientCard}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{(data.patient.name || "P").slice(0, 2).toUpperCase()}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.pName}>{data.patient.name}</Text>
            <Text style={styles.pMeta}>{[data.patient.age ? `${data.patient.age}y` : null, data.patient.gender, data.patient.blood_group].filter(Boolean).join(" · ")}</Text>
            <Text style={styles.pReason}>Token {data.appointment.token} · {data.appointment.reason || "Walk-in"}</Text>
          </View>
        </View>

        <Section title="Vitals">
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Field flex label="BP" value={vitals.bp} onChangeText={(t) => setVitals({ ...vitals, bp: t })} placeholder="120/80" editable={!done} />
            <Field flex label="Temp °F" value={vitals.temp} onChangeText={(t) => setVitals({ ...vitals, temp: t })} placeholder="98.6" editable={!done} />
            <Field flex label="Pulse" value={vitals.pulse} onChangeText={(t) => setVitals({ ...vitals, pulse: t })} placeholder="72" editable={!done} />
          </View>
        </Section>

        <Section title="Clinical notes">
          <Field label="Chief complaint" value={fields.chief_complaint} onChangeText={(t) => setFields({ ...fields, chief_complaint: t })} placeholder="e.g. Chest pain 2 days" editable={!done} testID="field-complaint" />
          <Field label="Notes" value={fields.clinical_notes} onChangeText={(t) => setFields({ ...fields, clinical_notes: t })} placeholder="Examination findings" multiline editable={!done} testID="field-notes" />
          <Field label="Diagnosis" value={fields.diagnosis} onChangeText={(t) => setFields({ ...fields, diagnosis: t })} placeholder="Provisional diagnosis" editable={!done} testID="field-diagnosis" />
          <Field label="Instructions" value={fields.instructions} onChangeText={(t) => setFields({ ...fields, instructions: t })} placeholder="Advice to patient" multiline editable={!done} testID="field-instructions" />
        </Section>

        <Section title="Medicines" action={!done ? <Pressable testID="add-medicine" onPress={() => setMedicines([...medicines, emptyMed()])}><Text style={styles.addLink}>+ Add</Text></Pressable> : undefined}>
          {medicines.map((m, i) => (
            <View key={i} style={styles.medCard} testID={`medicine-${i}`}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={styles.rxTile}><Text style={styles.rxText}>Rx</Text></View>
                <TextInput testID={`med-name-${i}`} editable={!done} style={styles.medName} placeholder="Medicine name" placeholderTextColor={C.placeholder} value={m.name} onChangeText={(t) => setMed(i, "name", t)} />
                {!done && medicines.length > 1 && <Pressable testID={`med-remove-${i}`} onPress={() => removeMed(i)}><Ionicons name="close-circle" size={20} color={C.placeholder} /></Pressable>}
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <TextInput editable={!done} style={styles.medSmall} placeholder="Dosage" placeholderTextColor={C.placeholder} value={m.dosage} onChangeText={(t) => setMed(i, "dosage", t)} />
                <TextInput editable={!done} style={styles.medSmall} placeholder="Frequency" placeholderTextColor={C.placeholder} value={m.frequency} onChangeText={(t) => setMed(i, "frequency", t)} />
                <TextInput editable={!done} style={styles.medSmall} placeholder="Duration" placeholderTextColor={C.placeholder} value={m.duration} onChangeText={(t) => setMed(i, "duration", t)} />
              </View>
            </View>
          ))}
        </Section>

        <Section title="Order lab tests">
          <View style={styles.chipWrap}>
            {LAB_PRESETS.map((t) => (
              <Chip key={t} testID={`lab-${t}`} label={t} active={labs.includes(t)} onPress={() => !done && toggleLab(t)} />
            ))}
          </View>
        </Section>

        {!done ? (
          <View style={{ gap: 10, marginTop: 8 }}>
            <SecondaryButton testID="save-draft" title="Save draft" onPress={saveDraft} />
            <PrimaryButton testID="complete-consultation" title="Complete consultation" loading={saving} onPress={complete} color={C.success} />
          </View>
        ) : (
          <Text style={styles.doneNote}>This consultation is complete. The prescription and any lab orders have been sent to the patient.</Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Section({ title, children, action }: any) {
  return (
    <View style={{ marginTop: 20 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

function Field({ label, flex, multiline, testID, ...props }: any) {
  return (
    <View style={{ flex: flex ? 1 : undefined, marginBottom: flex ? 0 : 12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        testID={testID}
        style={[styles.input, multiline && { height: 84, textAlignVertical: "top", paddingTop: 12 }]}
        placeholderTextColor={C.placeholder}
        multiline={multiline}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  hTitle: { fontSize: 18, fontWeight: F.w800, color: C.ink },
  patientCard: { flexDirection: "row", gap: 12, backgroundColor: C.card, borderRadius: RADIUS.card, borderWidth: 1, borderColor: C.border, padding: 16, ...shadow("card") },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.primaryTintStrong, alignItems: "center", justifyContent: "center" },
  avatarText: { color: C.primaryOnTint, fontWeight: F.w800, fontSize: 17 },
  pName: { fontSize: 16, fontWeight: F.w800, color: C.ink },
  pMeta: { fontSize: 12.5, color: C.textSecondary, fontWeight: F.w600, marginTop: 2 },
  pReason: { fontSize: 12.5, color: C.primary, fontWeight: F.w700, marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: F.w800, color: C.ink },
  addLink: { color: C.primary, fontWeight: F.w800, fontSize: 13.5 },
  fieldLabel: { fontSize: 12, fontWeight: F.w800, color: C.textSecondary, marginBottom: 6 },
  input: { minHeight: 48, borderWidth: 1, borderColor: C.border, borderRadius: RADIUS.input, paddingHorizontal: 12, fontSize: 14.5, fontWeight: F.w600, color: C.ink, backgroundColor: C.card },
  medCard: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: RADIUS.card, padding: 12, marginBottom: 10, ...shadow("card") },
  rxTile: { width: 32, height: 32, borderRadius: 8, backgroundColor: C.tealTint, alignItems: "center", justifyContent: "center" },
  rxText: { color: C.teal, fontWeight: F.w800, fontSize: 12 },
  medName: { flex: 1, fontSize: 14.5, fontWeight: F.w700, color: C.ink },
  medSmall: { flex: 1, height: 40, borderWidth: 1, borderColor: C.border, borderRadius: RADIUS.chip, paddingHorizontal: 10, fontSize: 12.5, fontWeight: F.w600, color: C.ink, backgroundColor: C.appBg },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  doneNote: { marginTop: 18, fontSize: 13, color: C.successText, fontWeight: F.w600, backgroundColor: C.successSoft, borderRadius: RADIUS.chip, padding: 14, lineHeight: 20 },
});
