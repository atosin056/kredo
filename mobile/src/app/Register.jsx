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

export default function Register() {
  const [phone, setPhone] = useState("");
  const [fontsLoaded] = useFonts({
    "InstrumentSans-Regular": require("../../assets/fonts/Instrument_Sans/static/InstrumentSans-Regular.ttf"),
    "InstrumentSans-Bold": require("../../assets/fonts/Instrument_Sans/static/InstrumentSans-Bold.ttf"), // ❌ missing "assets/"
    "InstrumentSans-Medium": require("../../assets/fonts/Instrument_Sans/static/InstrumentSans-Medium.ttf"),
    "InstrumentSans-SemiBold": require("../../assets/fonts/Instrument_Sans/static/InstrumentSans-SemiBold.ttf"),
  });

  if (!fontsLoaded) return null;

  const router = useRouter();
  const isValidPhone = phone.length === 10;

  const handleSubmit = async () => {
    if (!isValidPhone) return;
    console.log("submitting:", phone);
    router.push("Otp");
    // your actual API call
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
              <View>
                <View style={{ width: "100%", height: "200" }}>
                  <Image
                    source={artwork}
                    style={{ width: "auto", height: 200, borderRadius: 20 }}
                  />
                </View>
                <View style={{ marginTop: 50 }}>
                  <View style={{ gap: 12 }}>
                    <Text
                      style={{
                        color: "#fff",
                        fontSize: 20,
                        letterSpacing: -1,
                        fontFamily: "InstrumentSans-Medium",
                      }}
                    >
                      Enter your Telegram phone number
                    </Text>
                    <Text
                      style={{
                        color: "#808080",
                        fontSize: 14.5,
                        letterSpacing: -0.75,
                        fontFamily: "InstrumentSans-Regular",
                      }}
                    >
                      Enter the number linked to your Telegram account. We’ll
                      use it to securely connect your account to Kredo.
                    </Text>
                  </View>
                  <View style={{ marginTop: 20 }}>
                    <FormInput
                      label="Phone Number"
                      type="phone"
                      value={phone}
                      setValue={setPhone}
                    />
                  </View>
                  <Pressable
                    onPress={() => {
                      Keyboard.dismiss();
                      handleSubmit();
                    }}
                    disabled={!isValidPhone}
                    style={({ pressed }) => ({
                      marginTop: 20,
                      backgroundColor: !isValidPhone ? "grey" : "#CBE31B",
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
                      Continue
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </SafeAreaProvider>
  );
}
