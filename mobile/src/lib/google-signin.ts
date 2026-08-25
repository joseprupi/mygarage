// Native Google Sign-In (works in TestFlight/dev builds, NOT in Expo Go).
// The ID token's audience is the WEB client ID, which is what the backend verifies.
import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";

/** Expo Go has no custom native modules; never even require the package there. */
function nativeModulesAvailable(): boolean {
  if (Platform.OS === "web") return false;
  return Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
}

export const GOOGLE_WEB_CLIENT_ID = "147573336932-mm59b4qpu7nj6pbicu9f5forrnospa9a.apps.googleusercontent.com";
export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ??
  "147573336932-13dil6egmkp50tqur0lrl7cbb5oona98.apps.googleusercontent.com";

let configured = false;

/** Returns a Google ID token, or null if the native module isn't available (Expo Go). */
export async function signInWithGoogle(): Promise<string | null> {
  if (!nativeModulesAvailable()) return null;
  let mod: typeof import("@react-native-google-signin/google-signin");
  try {
    mod = require("@react-native-google-signin/google-signin");
  } catch {
    return null;
  }
  const { GoogleSignin } = mod;
  if (!configured) {
    GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, iosClientId: GOOGLE_IOS_CLIENT_ID || undefined });
    configured = true;
  }
  if (Platform.OS === "android") await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await GoogleSignin.signIn();
  if (result.type !== "success") return null;
  return result.data.idToken ?? null;
}

export function isGoogleSignInAvailable(): boolean {
  if (!nativeModulesAvailable()) return false;
  try {
    require("@react-native-google-signin/google-signin");
    return true;
  } catch {
    return false;
  }
}
