import {
  View,
  StyleSheet,
  Image,
  Text,
  Pressable,
  ScrollView,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import Moon from "../../assets/images/MoonStarsFill.svg";
import DropDown from "../../assets/images/DropDown.svg";
import Gear from "../../assets/images/Gear.svg";
import BullsEye from "../../assets/images/Bullseye.svg";
import BottomNav from "./components/BottomNav.jsx";
import TransactionSearch from "./components/TransactionSearch.jsx";
import { useRouter } from "expo-router";

import Blur from "./components/Blur.jsx";
import ArrowLeftRight from "../../assets/images/ArrowLeftRight.svg";

export default function Dashboard() {
  const [fontsLoaded] = useFonts({
    "InstrumentSans-Regular": require("../../assets/fonts/Instrument_Sans/static/InstrumentSans-Regular.ttf"),
    "InstrumentSans-Bold": require("../../assets/fonts/Instrument_Sans/static/InstrumentSans-Bold.ttf"),
    "InstrumentSans-Medium": require("../../assets/fonts/Instrument_Sans/static/InstrumentSans-Medium.ttf"),
    "InstrumentSans-SemiBold": require("../../assets/fonts/Instrument_Sans/static/InstrumentSans-SemiBold.ttf"),
  });

  if (!fontsLoaded) return null;

  const router = useRouter();

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: "#011208" }}>
      <SafeAreaView
        style={{
          flex: 1,
          paddingLeft: 15,
          paddingRight: 15,
        }}
      >
        <Blur />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: 70, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ gap: 15 }}>
            <View
              style={{
                width: "100%",
                alignItems: "flex-end",
              }}
            >
              <Moon />
            </View>
            <View
              style={{
                width: "100%",
                alignItems: "flex-end",
                flexDirection: "row",
                justifyContent: "flex-end",
                gap: 2,
              }}
            >
              <View>
                <DropDown />
              </View>
              <View>
                <Text
                  style={{
                    color: "#A5B695",
                    fontFamily: "InstrumentSans-Regular",
                  }}
                >
                  Opay
                </Text>
              </View>
            </View>
          </View>

          <View>
            <Text
              style={{
                color: "white",
                fontFamily: "InstrumentSans-Medium",
                fontSize: 20,
                letterSpacing: -1,
                marginTop: 24,
              }}
            >
              Welcome Tosin!
            </Text>
            <Text
              style={{
                color: "#fff",
                fontSize: 60,
                lineHeight: 100,
                fontFamily: "InstrumentSans-Regular",
              }}
            >
              ₦8,250
            </Text>
            <Text
              style={{
                color: "#fff",
                fontFamily: "InstrumentSans-Regular",
              }}
            >
              ✨ +₦1632 Than Last Month
            </Text>

            <View style={{ marginTop: 20, flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => {
                  // your transfer logic here
                  router.push("Transfer");
                }}
                style={({ pressed }) => [
                  {
                    paddingHorizontal: 20,
                    paddingVertical: 16,
                    backgroundColor: "#CBE31B",
                    width: "auto",
                    flexDirection: "row",
                    alignItems: "center",
                    minWidth: 135,
                    gap: 10,
                    borderRadius: 200,
                    justifyContent: "center",
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
                android_ripple={{ color: "#00000022" }}
              >
                <View>
                  <ArrowLeftRight />
                </View>
                <Text
                  style={{
                    fontSize: 14,
                    fontFamily: "InstrumentSans-Medium",
                    letterSpacing: -0.5,
                  }}
                >
                  Transfer
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  // your set-target logic here
                }}
                style={({ pressed }) => [
                  {
                    paddingHorizontal: 20,
                    paddingVertical: 16,
                    backgroundColor: "#258FF9",
                    width: "auto",
                    flexDirection: "row",
                    gap: 10,
                    minWidth: 135,
                    alignItems: "center",
                    borderRadius: 200,
                    justifyContent: "center",
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
                android_ripple={{ color: "#00000022" }}
              >
                <View>
                  <BullsEye />
                </View>
                <Text
                  style={{
                    fontSize: 14,
                    fontFamily: "InstrumentSans-Medium",
                    letterSpacing: -0.5,
                    color: "#fff",
                  }}
                >
                  Set Target
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  // open settings
                }}
                style={({ pressed }) => [
                  {
                    backgroundColor: "#020B05",
                    paddingVertical: 15,
                    paddingHorizontal: 15,
                    borderRadius: 100,
                    borderWidth: 0.7,
                    borderColor: "#fff",
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
                android_ripple={{ color: "#00000022" }}
              >
                <Gear />
              </Pressable>
            </View>

            <View style={{ marginTop: 30 }}>
              <TransactionSearch
                transactions={[
                  {
                    id: 1,
                    name: "Tosin",
                    date: "04 Nov 2027 . 7:20PM",
                    amount: 13.0,
                    type: "credit",
                  },
                  {
                    id: 2,
                    name: "Tosin",
                    date: "04 Nov 2027 . 7:20PM",
                    amount: 13.0,
                    type: "debit",
                  },
                  {
                    id: 3,
                    name: "Tosin",
                    date: "04 Nov 2027 . 7:20PM",
                    amount: 13.0,
                    type: "credit",
                  },
                  {
                    id: 4,
                    name: "Tosin",
                    date: "04 Nov 2027 . 7:20PM",
                    amount: 13.0,
                    type: "debit",
                  },
                  {
                    id: 5,
                    name: "Tosin",
                    date: "04 Nov 2027 . 7:20PM",
                    amount: 13.0,
                    type: "debit",
                  },
                ]}
              />
            </View>
          </View>
        </ScrollView>
        <BottomNav />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
