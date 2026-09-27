import { View, StyleSheet, Image, Text, Pressable } from "react-native";
import LogoWhite from "../../assets/images/logo-white.svg";
import card1 from "../../assets/images/card1.png";
import card2 from "../../assets/images/card2.png";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import Svg, {
  Circle,
  Defs,
  RadialGradient,
  Stop,
  Filter,
  FeGaussianBlur,
} from "react-native-svg";

import { useRouter } from "expo-router";

export default function Onboarding() {
  const [fontsLoaded] = useFonts({
    "InstrumentSans-Regular": require("../../assets/fonts/Instrument_Sans/static/InstrumentSans-Regular.ttf"),
    "InstrumentSans-Bold": require("../../assets/fonts/Instrument_Sans/static/InstrumentSans-Bold.ttf"), // ❌ missing "assets/"
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

        {/* card stack */}
        <View
          style={{
            width: "100%",
            height: 470,
            position: "relative",
            top: -80,
          }}
        >
          {/* blue card - sits behind, lower-left */}
          <Image
            source={card2}
            resizeMode="contain"
            style={{
              position: "absolute",
              width: "100%",
              aspectRatio: 1.586, // standard card ratio ~85.6/54
              top: 90,
              left: -70,
              transform: [{ rotate: "20deg" }],
              zIndex: 1,
            }}
          />

          {/* red UBA card - sits in front, upper-right */}
          <Image
            source={card1}
            resizeMode="contain"
            style={{
              position: "absolute",
              width: "100%",
              aspectRatio: 1.586,
              top: -90,
              left: 90,
              transform: [{ rotate: "-20deg" }],
              zIndex: 2,
            }}
          />
        </View>

        {/* Bottom Text */}
        <View>
          <View>
            <Text
              style={{
                color: "#fff",
                fontSize: 40,
                fontFamily: "InstrumentSans-Bold",
                letterSpacing: -3,
              }}
            >
              Banking, made conversational
            </Text>
            <Text
              style={{
                fontFamily: "InstrumentSans-Regular",
                color: "grey",
                fontSize: 17,
                letterSpacing: -1,
              }}
            >
              Talk, type, or send a screenshot. Kredo understands what you mean.
            </Text>
            <Pressable
              onPress={() => {
                /* navigate or handle signup start */
                router.push("Register");
              }}
              style={({ pressed }) => [
                {
                  backgroundColor: "#CBE31B",
                  paddingVertical: 16,
                  borderRadius: 100,
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
                Get Started
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
