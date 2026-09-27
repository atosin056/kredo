import { useState, useMemo } from "react";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import Search from "../../../assets/images/Search.svg"; // swap for your own search icon/svg if you're not using lucide

/**
 * Expected shape of each item in `transactions`:
 * {
 *   id: string | number,
 *   name: string,        // e.g. "Tosin"
 *   date: string,         // e.g. "04 Nov 2027 . 7:20PM"
 *   amount: number,       // e.g. 13.00
 *   type: "credit" | "debit",
 * }
 */

export default function TransactionSearch({ transactions = [] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return transactions;
    const q = query.trim().toLowerCase();
    return transactions.filter((t) => {
      return (
        t.name.toLowerCase().includes(q) ||
        t.date.toLowerCase().includes(q) ||
        String(t.amount).includes(q) ||
        t.type.toLowerCase().includes(q)
      );
    });
  }, [query, transactions]);

  return (
    <View
      style={{
        backgroundColor: "#1A2A21",
        paddingVertical: 15,
        paddingHorizontal: 10,
        borderRadius: 25,
        height: 320,
        maxHeight: 320,
        overflow: "hidden",
      }}
    >
      {/* Search bar */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: "#16241A",
          borderRadius: 100,
          paddingHorizontal: 16,
          paddingVertical: 6,
          gap: 10,
          marginBottom: 24,
        }}
      >
        <Search />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search Transactions"
          placeholderTextColor="#A5B695"
          style={{
            flex: 1,
            color: "#fff",
            fontFamily: "InstrumentSans-Regular",
            fontSize: 15,
          }}
        />
      </View>

      {/* Header row */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <Text
          style={{
            color: "#fff",
            fontFamily: "InstrumentSans-SemiBold",
            fontSize: 16,
          }}
        >
          Transaction History
        </Text>
        <Pressable onPress={() => {}}>
          <Text
            style={{
              color: "#A5B695",
              fontFamily: "InstrumentSans-Regular",
              fontSize: 14,
            }}
          >
            See Details
          </Text>
        </Pressable>
      </View>

      {/* List */}
      <ScrollView style={{ flex: 1 }} nestedScrollEnabled={true}>
        {filtered.length === 0 ? (
          <Text
            style={{
              color: "#A5B695",
              fontFamily: "InstrumentSans-Regular",
              textAlign: "center",
              marginTop: 24,
            }}
          >
            No transactions found
          </Text>
        ) : (
          filtered.map((item) => (
            <View
              key={String(item.id)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 12,
                gap: 12,
              }}
            >
              {/* Avatar placeholder */}
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: "#3A4A38",
                }}
              />

              {/* Name + date */}
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: "#fff",
                    fontFamily: "InstrumentSans-Medium",
                    fontSize: 15,
                  }}
                >
                  {item.name}
                </Text>
                <Text
                  style={{
                    color: "#A5B695",
                    fontFamily: "InstrumentSans-Regular",
                    fontSize: 12,
                    marginTop: 2,
                  }}
                >
                  {item.date}
                </Text>
              </View>

              {/* Amount + type */}
              <View style={{ alignItems: "flex-end" }}>
                <Text
                  style={{
                    color: "#fff",
                    fontFamily: "InstrumentSans-Medium",
                    fontSize: 15,
                  }}
                >
                  ${Number(item.amount).toFixed(2)}
                </Text>
                <Text
                  style={{
                    color: item.type === "credit" ? "#7ED957" : "#FF6B6B",
                    fontFamily: "InstrumentSans-Regular",
                    fontSize: 12,
                    marginTop: 2,
                  }}
                >
                  {item.type === "credit" ? "Credit" : "Debit"}
                </Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}
