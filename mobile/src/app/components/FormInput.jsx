import { useState } from "react";
import { View, Text, TextInput } from "react-native";

/**
 * FormInput
 *
 * Props:
 * - label      : string            -> label text shown above the input
 * - type       : "text" | "phone" | "email" | "password" | "number"
 * - value      : the current value of the target state
 * - setValue   : the setter for the target state (e.g. from useState)
 * - placeholder: optional placeholder override
 * - countryCode: optional, only used when type === "phone" (default "+234")
 */
export default function FormInput({
  label,
  type = "text",
  value,
  setValue,
  placeholder,
  countryCode = "+234",
}) {
  const [isFocused, setIsFocused] = useState(false);

  const isPhone = type === "phone";

  const keyboardTypeMap = {
    phone: "phone-pad",
    number: "numeric",
    email: "email-address",
    text: "default",
    password: "default",
  };

  const defaultPlaceholderMap = {
    phone: "703 137 2830",
    email: "you@example.com",
    text: "",
    number: "",
    password: "••••••••",
  };

  // Strips to digits and caps at 10 (matches +234 XXX XXX XXXX)
  const formatPhone = (digits) => {
    const part1 = digits.slice(0, 3);
    const part2 = digits.slice(3, 6);
    const part3 = digits.slice(6, 10);
    return [part1, part2, part3].filter(Boolean).join(" ");
  };

  const handleChangeText = (text) => {
    if (isPhone) {
      // strip everything but digits, cap at 10 — this is what gets sent to the backend
      const rawDigits = text.replace(/\D/g, "").slice(0, 10);
      setValue(rawDigits);
    } else {
      setValue(text);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <Text
        style={{
          color: "#fff",
          fontSize: 15,
          fontFamily: "InstrumentSans-Regular",
          letterSpacing: -0.75,
        }}
      >
        {label}
      </Text>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          borderWidth: 1,
          borderColor: isFocused ? "#fff" : "#2E3B33",
          borderRadius: 15,
          backgroundColor: "#1B2A21",
          paddingHorizontal: 18,
          height: 56,
          gap: 12,
        }}
      >
        {isPhone && (
          <>
            <Text
              style={{
                color: "#fff",
                fontSize: 15.5,
                fontFamily: "InstrumentSans-Medium",
              }}
            >
              {countryCode}
            </Text>
            <View
              style={{
                width: 1,
                height: 22,
                backgroundColor: "#3A4A40",
              }}
            />
          </>
        )}

        <TextInput
          value={isPhone ? formatPhone(value) : value}
          onChangeText={handleChangeText}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder ?? defaultPlaceholderMap[type]}
          placeholderTextColor="#808080"
          keyboardType={keyboardTypeMap[type]}
          secureTextEntry={type === "password"}
          autoCapitalize="none"
          style={{
            flex: 1,
            color: "#fff",
            fontSize: 15.5,
            fontFamily: "InstrumentSans-Regular",
            letterSpacing: -0.5,
          }}
        />
      </View>
    </View>
  );
}
