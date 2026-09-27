import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  FlatList,
  StyleSheet,
} from "react-native";

/**
 * Select
 *
 * Props:
 * - options     : array of strings, OR array of { label, value } objects
 * - value       : the current selected value (string, or the `value` field of an option object)
 * - setValue    : setter for the selected value (e.g. from useState)
 * - placeholder : text shown when nothing is selected (e.g. "-- Select Bank --")
 * - title       : optional heading shown at the top of the modal list
 */
export default function Select({
  options = [],
  value,
  setValue,
  placeholder = "-- Select --",
  title,
}) {
  const [open, setOpen] = useState(false);

  // normalize options so both ["GTBank", "Access Bank"] and
  // [{ label: "GTBank", value: "gtb" }] work the same way
  const normalized = options.map((opt) =>
    typeof opt === "string" ? { label: opt, value: opt } : opt,
  );

  const selected = normalized.find((opt) => opt.value === value);

  return (
    <View>
      <Pressable onPress={() => setOpen(true)}>
        <View
          style={{
            height: 40,
            justifyContent: "center",
            borderBottomColor: "rgba(255, 255, 255, 0.25)",
            borderBottomWidth: 0.5,
          }}
        >
          <Text
            style={{
              fontFamily: "InstrumentSans-Regular",
              letterSpacing: -0.25,
              fontSize: 15.5,
              color: selected ? "#fff" : "#808080",
            }}
          >
            {selected ? selected.label : placeholder}
          </Text>
        </View>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            {title && (
              <Text
                style={{
                  color: "#fff",
                  fontSize: 16,
                  fontFamily: "InstrumentSans-SemiBold",
                  marginBottom: 12,
                }}
              >
                {title}
              </Text>
            )}

            <FlatList
              data={normalized}
              keyExtractor={(item, i) => String(item.value ?? i)}
              style={{ maxHeight: 320 }}
              ItemSeparatorComponent={() => (
                <View
                  style={{
                    height: 0.5,
                    backgroundColor: "rgba(255, 255, 255, 0.1)",
                  }}
                />
              )}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    setValue(item.value);
                    setOpen(false);
                  }}
                  style={({ pressed }) => ({
                    paddingVertical: 14,
                    backgroundColor: pressed
                      ? "rgba(255,255,255,0.06)"
                      : "transparent",
                  })}
                >
                  <Text
                    style={{
                      color: item.value === value ? "#CBE31B" : "#fff",
                      fontFamily: "InstrumentSans-Regular",
                      fontSize: 15.5,
                    }}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#1B2A21",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
});
