import { View, Text, Pressable } from "react-native";

/**
 * Keypad
 *
 * A dumb, reusable numeric keypad — it doesn't manage any state itself.
 * You handle what each key press means (building an amount, a PIN, etc.)
 * in your own `onKeyPress` handler.
 *
 * Props:
 * - onKeyPress : (key: string) => void
 *                 called with "0"-"9", "." (unless disabled), or "backspace"
 * - showDot    : optional, defaults to true. Set to false for PIN-style
 *                 keypads where a decimal point doesn't make sense — that
 *                 slot in the grid is left blank instead.
 */
export default function Keypad({ onKeyPress, showDot = true }) {
  const keys = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    [showDot ? "." : "", "0", "backspace"],
  ];

  return (
    <View style={{ gap: 7 }}>
      {keys.map((row, rowIndex) => (
        <View key={rowIndex} style={{ flexDirection: "row", gap: 5 }}>
          {row.map((key, i) => {
            // blank filler slot (e.g. PIN keypad with no ".")
            if (key === "") {
              return <View key={i} style={{ flex: 1, height: 60 }} />;
            }

            return (
              <Pressable
                key={key}
                onPress={() => onKeyPress(key)}
                style={({ pressed }) => ({
                  flex: 1,
                  margin: 0,
                  height: 60,
                  borderRadius: 14,
                  backgroundColor: pressed ? "#3E4F44" : "#2C3B31",
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1.5,
                  borderColor: "rgba(255, 255, 255, 0.15)",
                })}
              >
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 20,
                    fontFamily: "InstrumentSans-Medium",
                  }}
                >
                  {key === "backspace" ? "⌫" : key}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
