import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerTitleStyle: { fontWeight: "700" },
        headerTintColor: "#2563eb",
      }}
    >
      <Stack.Screen name="index" options={{ title: "CeCeCar" }} />
      <Stack.Screen name="login" options={{ title: "Log in", presentation: "modal" }} />
    </Stack>
  );
}
