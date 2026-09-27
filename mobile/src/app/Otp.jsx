import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Pressable,
  Image,
  Text,
  KeyboardAvoidingView,
  ScrollView,
  Keyboard,
} from "react-native";
import Blur from "./components/Blur.jsx";
import { useRouter } from "expo-router";
import { useFonts } from "expo-font";
import { useState } from "react";
import ArrowLeft from "../../assets/images/ArrowLeft.svg";
import artwork from "../../assets/images/artwork.png";
import FormInput from "./components/FormInput.jsx";

export default function Otp() {
  const [otp, setOtp] = useState("");
  const [fontsLoaded] = useFonts({
    "InstrumentSans-Regular": require("../../assets/fonts/Instrument_Sans/static/InstrumentSans-Regular.ttf"),
    "InstrumentSans-Bold": require("../../assets/fonts/Instrument_Sans/static/InstrumentSans-Bold.ttf"), // ❌ missing "assets/"
    "InstrumentSans-Medium": require("../../assets/fonts/Instrument_Sans/static/InstrumentSans-Medium.ttf"),
    "InstrumentSans-SemiBold": require("../../assets/fonts/Instrument_Sans/static/InstrumentSans-SemiBold.ttf"),
  });

  if (!fontsLoaded) return null;

  const router = useRouter();
  const isValidOtp = otp.length === 6;

  const handleSubmit = async () => {
    if (!isValidOtp) return;
    console.log("submitting:", otp);
    // your actual API call

    router.push("Auth");
  };
  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: "#011208" }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={"height"}
        keyboardVerticalOffset={0}
      >
        <SafeAreaView
          style={{
            flex: 1,
            // paddingTop: 80,
            // paddingLeft: 15,
            // paddingRight: 15,
            // gap: 10,
          }}
        >
          <ScrollView
            contentContainerStyle={{
              paddingTop: 80,
              paddingLeft: 15,
              paddingRight: 15,
              gap: 10,
              flexGrow: 1,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Blur />

            <View style={{ gap: 50 }}>
              <View>
                <Pressable
                  onPress={() => router.push("Onboarding")}
                  style={({ pressed }) => ({
                    borderWidth: 0.75,
                    borderColor: "#fff",
                    width: 50,
                    height: 50,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 100,
                    backgroundColor: pressed ? "#28392E" : "#1B2A21",
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <ArrowLeft />
                </Pressable>
              </View>
              <View style={{ gap: 20 }}>
                <View style={{ gap: 10 }}>
                  <Text
                    style={{
                      color: "#fff",
                      fontSize: 22,
                      letterSpacing: -0.75,
                      fontFamily: "InstrumentSans-Medium",
                    }}
                  >
                    Verify OTP
                  </Text>
                  <Text
                    style={{
                      color: "grey",
                      fontFamily: "InstrumentSans-Regular",
                    }}
                  >
                    We sent a confirmation code to +234 703 137 2830. Enter the
                    6-digit code below to continue.
                  </Text>
                </View>
                <View>
                  <FormInput
                    label="OTP"
                    type="number"
                    placeholder="123456"
                    setValue={setOtp}
                  />
                </View>
                <Pressable
                  onPress={() => {
                    Keyboard.dismiss();
                    handleSubmit();
                  }}
                  disabled={!isValidOtp}
                  style={({ pressed }) => ({
                    marginTop: 20,
                    backgroundColor: !isValidOtp ? "grey" : "#CBE31B",
                    maxWidth: 140,
                    justifyContent: "center",
                    alignItems: "center",
                    paddingVertical: 16,
                    borderRadius: 100,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Text
                    style={{
                      fontFamily: "InstrumentSans-SemiBold",
                      letterSpacing: -0.7,
                    }}
                  >
                    Verify
                  </Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </SafeAreaProvider>
  );
}
