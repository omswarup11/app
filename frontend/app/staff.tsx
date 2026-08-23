import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { C, F, RADIUS, shadow } from "@/src/theme";
import { PrimaryButton } from "@/src/ui";

const ROLE_LABEL: Record<string, string> = {
  receptionist: "Reception / Queue Console",
  doctor: "Doctor Consultation Console",
  lab_technician: "Lab Technician Console",
  clinic_admin: "Clinic Admin",
  super_admin: "Super Admin",
};

export default function Staff() {
  const insets = useSafeAreaInsets();
  const { user, role, logout } = useAuth();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 30, paddingBottom: insets.bottom + 20 }]}>
      <View style={{ alignItems: "center", gap: 12 }}>
        <View style={styles.badge}><Ionicons name="business" size={30} color={C.primary} /></View>
        <Text style={styles.title}>{ROLE_LABEL[role || ""] || "Staff Console"}</Text>
        <Text style={styles.name}>Signed in as {user?.name}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Console coming next</Text>
        <Text style={styles.cardBody}>
          The backend for your role is live on Supabase — queue controls, walk-ins, consultations,
          lab workflow and admin tools. The full staff interface for this role is being built in the
          next phase. The patient app is ready to try now.
        </Text>
      </View>

      <PrimaryButton testID="staff-logout" title="Log out" color={C.ink} onPress={logout} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.appBg, paddingHorizontal: 24, justifyContent: "space-between" },
  badge: { width: 72, height: 72, borderRadius: 20, backgroundColor: C.primaryTint, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: F.w800, color: C.ink, textAlign: "center", letterSpacing: -0.5 },
  name: { fontSize: 13.5, color: C.textSecondary, fontWeight: F.w600 },
  card: { backgroundColor: C.card, borderRadius: RADIUS.card, borderWidth: 1, borderColor: C.border, padding: 20, ...shadow("card") },
  cardTitle: { fontSize: 16, fontWeight: F.w800, color: C.ink, marginBottom: 8 },
  cardBody: { fontSize: 13.5, color: C.textSecondary, fontWeight: F.w600, lineHeight: 21 },
});
