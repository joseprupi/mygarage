import { Pressable } from "react-native";
import { Stack, router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerTitleStyle: { fontWeight: "700" },
        headerTintColor: "#2563eb",
        // Explicit back control: native back behavior proved unreliable after the
        // SDK pin, and modals otherwise have no visible way to close.
        headerLeft: ({ canGoBack }) =>
          canGoBack ? (
            <Pressable onPress={() => router.back()} hitSlop={10} style={{ paddingRight: 10 }}>
              <Ionicons name="chevron-back" size={26} color="#2563eb" />
            </Pressable>
          ) : null,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ title: "Log in", presentation: "modal", headerShown: false }} />
      <Stack.Screen name="signup" options={{ title: "Sign up", presentation: "modal" }} />
      <Stack.Screen name="post/[id]" options={{ title: "Post" }} />
      <Stack.Screen name="post-new" options={{ title: "New post", presentation: "modal" }} />
      <Stack.Screen name="vehicle/[id]/index" options={{ title: "Vehicle" }} />
      <Stack.Screen name="vehicle/[id]/event-form" options={{ title: "History event", presentation: "modal" }} />
      <Stack.Screen name="vehicle/[id]/mod-form" options={{ title: "Mod", presentation: "modal" }} />
      <Stack.Screen name="vehicle/[id]/fuel" options={{ title: "Fuel-up", presentation: "modal" }} />
      <Stack.Screen name="vehicle/[id]/stats" options={{ title: "Stats" }} />
      <Stack.Screen name="vehicle-form" options={{ title: "Vehicle", presentation: "modal" }} />
    </Stack>
  );
}
