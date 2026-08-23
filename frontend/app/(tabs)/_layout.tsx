import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Platform } from "react-native";

import { C, F } from "@/src/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.textTertiary,
        tabBarStyle: {
          backgroundColor: "rgba(255,255,255,0.98)",
          borderTopColor: C.border,
          borderTopWidth: 1,
          height: Platform.OS === "ios" ? 86 : 66,
          paddingTop: 8,
          paddingBottom: Platform.OS === "ios" ? 28 : 10,
        },
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: F.w800 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Home", tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size - 1} color={color} /> }}
      />
      <Tabs.Screen
        name="book"
        options={{ title: "Book", tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size - 1} color={color} /> }}
      />
      <Tabs.Screen
        name="queue"
        options={{ title: "Queue", tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size - 1} color={color} /> }}
      />
      <Tabs.Screen
        name="records"
        options={{ title: "Records", tabBarIcon: ({ color, size }) => <Ionicons name="folder-open" size={size - 1} color={color} /> }}
      />
    </Tabs>
  );
}
