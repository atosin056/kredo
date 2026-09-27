import { View, StyleSheet, Image, Text, Pressable } from "react-native";
import LogoWhite from "../../assets/images/logo-white.svg";
import * as LocalAuthentication from "expo-local-authentication";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import LogoGreen from "../../assets/images/logo-green.svg";
import FingerPrint from "../../assets/images/Fingerprint.svg";
import { useFonts } from "expo-font";
import { useEffect } from "react";
import { useRouter } from "expo-router";
import Svg, {
  Circle,
  Defs,
  RadialGradient,
  Stop,
  Filter,
  FeGaussianBlur,
} from "react-native-svg";

export default function Index() {
  useEffect(() => {
    if (fontsLoaded) {
      handleVerifyFingerprint();
    }
  }, [fontsLoaded]);
  const [fontsLoaded] = useFonts({
    "InstrumentSans-Regular": require("../../assets/fonts/Instrument_Sans/static/InstrumentSans-Regular.ttf"),
    "InstrumentSans-Bold": require("../../assets/fonts/Instrument_Sans/static/InstrumentSans-Bold.ttf"),
    "InstrumentSans-Medium": require("../../assets/fonts/Instrument_Sans/static/InstrumentSans-Medium.ttf"),
    "InstrumentSans-SemiBold": require("../../assets/fonts/Instrument_Sans/static/InstrumentSans-SemiBold.ttf"),
  });

  if (!fontsLoaded) return null;

  const router = useRouter();

  const handleVerifyFingerprint = async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      console.log("No biometric hardware on this device");
      return;
    }
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) {
      console.log("No fingerprint/face enrolled on this device");
      return;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Verify your identity",
      cancelLabel: "Cancel",
      disableDeviceFallback: false, // true = don't allow PIN/passcode fallback
    });
    if (result.success) {
      // proceed — navigate to home, unlock session, etc.
      router.push("Dashboard");
    } else {
      // result.error tells you why: "user_cancel", "lockout", "not_available", etc.
      console.log("Auth failed:", result.error);
    }
  };

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: "#011208" }}>
      <SafeAreaView
        style={{
          flex: 1,
          paddingTop: 40,
          paddingLeft: 15,
          paddingRight: 15,
        }}
      >
        <Svg
          height="500"
          width="500"
          style={{ position: "absolute", top: -100, left: -50 }}
        >
          <Defs>
            <RadialGradient id="glow" cx="90%" cy="20%" r="40%">
              <Stop offset="0%" stopColor="#FFFF00" stopOpacity="0.5" />
              <Stop offset="100%" stopColor="#728D1D" stopOpacity="0" />
            </RadialGradient>
            <Filter
              id="blurFilter"
              x="-50%"
              y="-50%"
              width="200%"
              height="200%"
            >
              <FeGaussianBlur stdDeviation="50" />
            </Filter>
          </Defs>
          <Circle
            cx="200"
            cy="200"
            r="250"
            fill="url(#glow)"
            filter="url(#blurFilter)"
          />
        </Svg>

        <View>
          <LogoWhite style={{ marginTop: 0, marginLeft: 0 }} />
        </View>

        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            flex: 1,
          }}
        >
          <View
            style={{
              justifyContent: "space-between",
              alignItems: "center",
              flex: 0.7,
            }}
          >
            <View
              style={{
                gap: 50,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <View>
                <LogoGreen />
              </View>
              <View>
                <FingerPrint />
              </View>
              <Pressable
                onPress={() => {
                  handleVerifyFingerprint();
                  /* navigate or handle signup start */
                }}
                style={({ pressed }) => [
                  {
                    backgroundColor: "#CBE31B",
                    paddingVertical: 16,
                    borderRadius: 100,
                    paddingHorizontal: 20,
                    alignItems: "center",
                    marginTop: 24,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
                android_ripple={{ color: "#00000022" }}
              >
                <Text
                  style={{
                    color: "#011208",
                    fontFamily: "InstrumentSans-SemiBold",
                    fontSize: 16,
                  }}
                >
                  Click to Verify Fingerprint
                </Text>
              </Pressable>
            </View>
            <View
              style={{
                flexDirection: "Column",
                alignItems: "center",
                gap: 10,
                justifyContent: "flex-end",
              }}
            >
              <View>
                <Text
                  style={{
                    color: "white",
                    fontFamily: "InstrumentSans-Bold",
                    letterSpacing: -1,
                  }}
                >
                  OR
                </Text>
              </View>
              <Pressable
                style={({ pressed }) => []}
                android_ripple={{ color: "#CBE31B44" }}
              >
                <Text
                  style={{
                    color: "#A4B816",
                    fontFamily: "InstrumentSans-SemiBold",
                  }}
                >
                  Login with PIN
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
