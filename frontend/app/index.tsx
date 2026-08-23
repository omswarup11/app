import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { useAuth } from "@/src/auth";
import { C } from "@/src/theme";

export default function Index() {
  const { loading, user, role } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.appBg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={C.primary} size="large" />
      </View>
    );
  }
  if (!user) return <Redirect href="/login" />;
  if (role === "patient") return <Redirect href="/(tabs)" />;
  return <Redirect href="/staff" />;
}
