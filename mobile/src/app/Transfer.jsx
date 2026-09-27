import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Pressable,
  Image,
  Text,
  KeyboardAvoidingView,
  ScrollView,
  Keyboard,
  TextInput,
} from "react-native";
import Blur from "./components/Blur.jsx";
import { useRouter } from "expo-router";
import { useFonts } from "expo-font";
import { useState } from "react";
import ArrowLeft from "../../assets/images/ArrowLeft.svg";
import Grid from "../../assets/images/grid.svg";

import Select from "./components/Select.jsx";
import Keypad from "./components/Keypad.jsx";

export default function Transfer() {
  const [bank, setBank] = useState(null);
  const [amount, setAmount] = useState("");

  const [isName, setIsName] = useState(true); // For you to toggle the name field
  const [name, setName] = useState("");
  const [fontsLoaded] = useFonts({
    "InstrumentSans-Regular": require("../../assets/fonts/Instrument_Sans/static/InstrumentSans-Regular.ttf"),
    "InstrumentSans-Bold": require("../../assets/fonts/Instrument_Sans/static/InstrumentSans-Bold.ttf"), // ❌ missing "assets/"
    "InstrumentSans-Medium": require("../../assets/fonts/Instrument_Sans/static/InstrumentSans-Medium.ttf"),
    "InstrumentSans-SemiBold": require("../../assets/fonts/Instrument_Sans/static/InstrumentSans-SemiBold.ttf"),
  });

  if (!fontsLoaded) return null;

  const router = useRouter();

  const formatDisplay = (raw) => {
    if (raw === "") return "0.00";

    const [intPart, decPart] = raw.split(".");
    const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

    if (decPart === undefined) return `${formattedInt}.00`;
    return `${formattedInt}.${decPart.padEnd(2, "0").slice(0, 2)}`;
  };

  const handleKeyPress = (key) => {
    if (key === "backspace") {
      setAmount((prev) => prev.slice(0, -1));
      return;
    }
    if (key === ".") {
      if (amount.includes(".") || amount === "") return;
      setAmount((prev) => prev + ".");
      return;
    }
    setAmount((prev) => {
      if (prev === "0") return key;
      if (prev.includes(".") && prev.split(".")[1].length >= 2) return prev;
      return prev + key;
    });
  };
  console.log(amount);
  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: "#011208" }}>
      <SafeAreaView style={{ flex: 1 }}>
        <Blur />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingTop: 40,
            paddingLeft: 15,
            paddingRight: 15,
            paddingBottom: 60,
            gap: 10,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ gap: 40 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Pressable
                onPress={() => {
                  // open settings
                }}
                style={({ pressed }) => [
                  {
                    backgroundColor: "#1B2A21",
                    paddingVertical: 15,
                    paddingHorizontal: 15,
                    borderRadius: 100,
                    borderWidth: 0.7,
                    borderColor: "#2D3B32",
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
                android_ripple={{ color: "#00000022" }}
              >
                <ArrowLeft />
              </Pressable>
              <View>
                <View>
                  <Text
                    style={{
                      color: "#fff",
                      fontSize: 18,
                      fontFamily: "InstrumentSans-SemiBold",
                    }}
                  >
                    Send Money
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => {
                  // open settings
                }}
                style={({ pressed }) => [
                  {
                    backgroundColor: "#1B2A21",
                    paddingVertical: 15,
                    paddingHorizontal: 15,
                    borderRadius: 100,
                    borderWidth: 0.7,
                    borderColor: "#2D3B32",
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
                android_ripple={{ color: "#00000022" }}
              >
                <Grid />
              </Pressable>
            </View>
            <View>
              <View
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.15)",
                  paddingHorizontal: 20,
                  paddingVertical: 15,
                  borderRadius: 20,
                }}
              >
                <View>
                  <View>
                    <Text
                      style={{
                        color: "#fff",
                        fontFamily: "InstrumentSans-Medium",
                      }}
                    >
                      Recipient Account:{" "}
                    </Text>
                  </View>
                  <View style={{ marginTop: 10, gap: 10 }}>
                    <View>
                      <TextInput
                        placeholder="Enter 10 Digit account number"
                        placeholderTextColor="#808080"
                        keyboardType="numeric"
                        style={{
                          fontFamily: "InstrumentSans-Regular",
                          letterSpacing: -0.25,
                          height: 40,
                          color: "#fff",
                          borderBottomColor: "rgba(255, 255, 255, 0.25)",
                          borderBottomWidth: 0.5,
                        }}
                      />
                      <Select
                        options={[
                          "GTBank",
                          "Access Bank",
                          "Zenith Bank",
                          "UBA",
                          "First Bank",
                        ]}
                        value={bank}
                        setValue={setBank}
                        placeholder="-- Select Bank --"
                        title="Select Bank"
                      />
                    </View>
                    <View>
                      {isName ? (
                        <View
                          style={{
                            backgroundColor: "rgba(255, 255, 255, 0.15)",
                            paddingVertical: 10,
                            //   alignItems: "center",
                            borderRadius: 10,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: "InstrumentSans-Medium",
                              color: "#fff",
                              textTransform: "uppercase",
                              textAlign: "center",
                            }}
                          >
                            Oluwatosin Lloyd Akinfenwa
                          </Text>
                        </View>
                      ) : (
                        ""
                      )}
                      <Pressable
                        style={({ pressed }) => [
                          {
                            marginTop: 10,
                            backgroundColor: "#CAE119",
                            alignItems: "center",
                            paddingVertical: 10,
                            borderRadius: 100,
                            opacity: pressed ? 0.7 : 1,
                          },
                        ]}
                        android_ripple={{ color: "#00000022" }}
                      >
                        <Text
                          style={{
                            fontFamily: "InstrumentSans-Medium",
                            letterSpacing: -0.7,
                          }}
                        >
                          Continue
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </View>
            </View>
            <View style={{ gap: 10 }}>
              <View>
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 17,
                    fontFamily: "InstrumentSans-Medium",
                    letterSpacing: -0.75,
                  }}
                >
                  Amount
                </Text>
                <Text
                  style={{
                    fontSize: 50,
                    fontFamily: "InstrumentSans-SemiBold",
                    color: "#fff",
                  }}
                >
                  ₦ {formatDisplay(amount)}
                </Text>
              </View>
              <View>
                <Keypad onKeyPress={handleKeyPress} showDot={true} />
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
