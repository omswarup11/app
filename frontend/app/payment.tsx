import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { api } from "@/src/api";
import { C, F, RADIUS, shadow } from "@/src/theme";
import { PrimaryButton, Screen, ScreenHeader } from "@/src/ui";

const METHODS = [
  { key: "upi", label: "UPI", sub: "GPay / PhonePe / Paytm", tag: "Instant", icon: "phone-portrait" },
  { key: "card", label: "Card", sub: "Credit / Debit", tag: "Saved", icon: "card" },
  { key: "netbanking", label: "Netbanking", sub: "All major banks", tag: "", icon: "business" },
  { key: "wallet", label: "Wallet", sub: "Amazon Pay & more", tag: "", icon: "wallet" },
];

export default function Payment() {
  const p = useLocalSearchParams<{ holdId: string; doctorName: string; specialization: string; fee: string; date: string; time: string }>();
  const [order, setOrder] = useState<any>(null);
  const [method, setMethod] = useState("upi");
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(300);
  const timer = useRef<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const o = await api.order(p.holdId);
        setOrder(o);
      } catch (e: any) {
        setError(e.message || "Could not start payment");
      }
    })();
  }, [p.holdId]);

  useEffect(() => {
    timer.current = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(timer.current);
  }, []);

  const mmss = `${String(Math.floor(seconds / 60)).padStart(1, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  const pay = async () => {
    if (!order) return;
    setPaying(true); setError("");
    // Prototype: 1.6s "Contacting Razorpay…" then confirm on the server.
    await new Promise((r) => setTimeout(r, 1600));
    try {
      const res = await api.confirm({ payment_id: order.payment_id, method });
      router.replace({
        pathname: "/confirmation",
        params: {
          doctorName: p.doctorName, date: p.date, time: p.time,
          token: String(res.appointment.token_number), amount: String(order.amount_rupees),
          reference: res.reference || "", method,
        },
      });
    } catch (e: any) {
      setError(e.message || "Payment failed. Please try again.");
      setPaying(false);
    }
  };

  const b = order?.breakdown;

  return (
    <Screen header={<ScreenHeader title="Payment" onBack={() => router.back()} />}>
      {/* order summary */}
      <View style={styles.summary}>
        <Text style={styles.sumLabel}>APPOINTMENT</Text>
        <Text style={styles.sumDoctor}>{p.doctorName}</Text>
        <Text style={styles.sumMeta}>{p.specialization} · {p.date} · {p.time}</Text>
      </View>

      {order ? (
        <>
          <View style={styles.lines}>
            <Line label="Consultation fee" value={b.consultation_fee} />
            <Line label="Platform fee" value={b.platform_fee} />
            <Line label="GST (18% on platform fee)" value={b.gst} />
            <View style={styles.hr} />
            <View style={styles.lineRow}>
              <Text style={styles.totalLabel}>Total payable</Text>
              <Text style={styles.totalValue}>₹{b.total_rupees}</Text>
            </View>
          </View>

          <Text style={styles.section}>Payment method</Text>
          <View style={{ gap: 10 }}>
            {METHODS.map((m) => {
              const active = m.key === method;
              return (
                <Pressable key={m.key} testID={`method-${m.key}`} onPress={() => setMethod(m.key)} style={[styles.method, active && styles.methodActive]}>
                  <View style={[styles.radio, active && { borderColor: C.primary }]}>{active && <View style={styles.radioDot} />}</View>
                  <View style={styles.methodIcon}><Ionicons name={m.icon as any} size={18} color={C.primary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.methodLabel}>{m.label}</Text>
                    <Text style={styles.methodSub}>{m.sub}</Text>
                  </View>
                  {!!m.tag && <Text style={styles.methodTag}>{m.tag}</Text>}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.secure}>
            <Ionicons name="lock-closed" size={14} color={C.successText} />
            <Text style={styles.secureText}>Processed securely by Razorpay. No card details are stored.</Text>
          </View>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <PrimaryButton
            testID="pay-button"
            title={paying ? "Contacting Razorpay…" : `Pay ₹${b.total_rupees} securely`}
            loading={paying}
            onPress={pay}
            style={{ marginTop: 16 }}
          />
          <Text style={styles.held}>Slot held for {mmss}</Text>
        </>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <ActivityIndicator color={C.primary} style={{ marginTop: 30 }} />
      )}
    </Screen>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.lineRow}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue}>₹{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { backgroundColor: C.card, borderRadius: RADIUS.card, borderWidth: 1, borderColor: C.border, padding: 18, ...shadow("card") },
  sumLabel: { fontSize: 11, fontWeight: F.w800, color: C.textTertiary, letterSpacing: 0.6 },
  sumDoctor: { fontSize: 17, fontWeight: F.w800, color: C.ink, marginTop: 6 },
  sumMeta: { fontSize: 13, color: C.textSecondary, fontWeight: F.w600, marginTop: 3 },
  lines: { backgroundColor: C.card, borderRadius: RADIUS.card, borderWidth: 1, borderColor: C.border, padding: 18, marginTop: 14, gap: 12 },
  lineRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  lineLabel: { fontSize: 13.5, color: C.textSecondary, fontWeight: F.w600 },
  lineValue: { fontSize: 13.5, color: C.ink, fontWeight: F.w700 },
  hr: { height: 1, backgroundColor: C.divider },
  totalLabel: { fontSize: 15, fontWeight: F.w800, color: C.ink },
  totalValue: { fontSize: 20, fontWeight: F.w800, color: C.ink, letterSpacing: -0.5 },
  section: { fontSize: 15, fontWeight: F.w800, color: C.ink, marginTop: 22, marginBottom: 12 },
  method: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.card, borderRadius: RADIUS.input, borderWidth: 1, borderColor: C.border, padding: 14 },
  methodActive: { backgroundColor: C.primaryTint, borderColor: C.primary },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: C.placeholder, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.primary },
  methodIcon: { width: 34, height: 34, borderRadius: 9, backgroundColor: C.primaryTint, alignItems: "center", justifyContent: "center" },
  methodLabel: { fontSize: 14.5, fontWeight: F.w800, color: C.ink },
  methodSub: { fontSize: 12, color: C.textSecondary, fontWeight: F.w600, marginTop: 1 },
  methodTag: { fontSize: 10.5, fontWeight: F.w800, color: C.successText, backgroundColor: C.successBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.pill },
  secure: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.successSoft, borderRadius: RADIUS.chip, padding: 12, marginTop: 16 },
  secureText: { flex: 1, fontSize: 12, color: C.successText, fontWeight: F.w600 },
  error: { color: C.dangerText, fontSize: 13, fontWeight: F.w700, marginTop: 14 },
  held: { textAlign: "center", fontSize: 12.5, color: C.textTertiary, fontWeight: F.w700, marginTop: 12 },
});
