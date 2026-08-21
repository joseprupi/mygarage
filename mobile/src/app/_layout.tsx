import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerTitleStyle: { fontWeight: "700" },
        headerTintColor: "#2563eb",
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
    </Stack>
  );
}
