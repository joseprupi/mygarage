/**
 * Permission helpers for camera and photo library.
 * Call before launching any picker. Returns true if the picker may be used.
 */
import { Alert, Linking, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";

/**
 * Request camera permission and show an appropriate alert when denied.
 * - If the user permanently blocked it (`canAskAgain === false`): show an alert
 *   with an "Open Settings" button.
 * - If just denied this time: show a short informational alert.
 * Returns true only when the camera is actually granted.
 */
export async function ensureCamera(): Promise<boolean> {
  if (Platform.OS === "web") return true;
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (perm.granted) return true;
  if (!perm.canAskAgain) {
    Alert.alert(
      "Camera access is off",
      "Enable the camera for CarFable in Settings to take photos.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Open Settings", onPress: () => void Linking.openSettings() },
      ],
    );
  } else {
    Alert.alert("Camera permission denied", "Please allow camera access to take photos.");
  }
  return false;
}

/**
 * Request photo library permission and show an appropriate alert when denied.
 * Same two-case behaviour as ensureCamera (canAskAgain vs denied-just-now).
 * Returns true only when library access is granted.
 */
export async function ensureLibrary(): Promise<boolean> {
  if (Platform.OS === "web") return true;
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.granted) return true;
  if (!perm.canAskAgain) {
    Alert.alert(
      "Photo library access is off",
      "Enable photo library access for CarFable in Settings to pick photos.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Open Settings", onPress: () => void Linking.openSettings() },
      ],
    );
  } else {
    Alert.alert("Photo library access denied", "Please allow photo library access to pick photos.");
  }
  return false;
}
