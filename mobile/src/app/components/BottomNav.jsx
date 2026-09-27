import { useState } from "react";
import { View, Pressable } from "react-native";

// Swap these paths for your actual icon files once you send them over
import HomeIcon from "../../../assets/images/HouseDoor.svg";
import CardIcon from "../../../assets/images/CreditCard.svg";
import BotIcon from "../../../assets/images/Robot.svg";
import PeopleIcon from "../../../assets/images/People.svg";

/**
 * BottomNav — self-contained, no props needed.
 * Usage: <BottomNav />
 *
 * Wire up navigation directly in NAV_ITEMS below — each item owns its own onPress.
 */

const ACTIVE_BG = "#808883";
const INACTIVE_BG = "#48544D";
const ACTIVE_ICON_COLOR = "#fff";
const INACTIVE_ICON_COLOR = "#7A8B76";

const NAV_ITEMS = [
  { key: "home", icon: HomeIcon, onPress: () => {} },
  { key: "cards", icon: CardIcon, onPress: () => {} },
  { key: "assistant", icon: BotIcon, onPress: () => {} },
  { key: "people", icon: PeopleIcon, onPress: () => {} },
];

export default function BottomNav() {
  const [activeKey, setActiveKey] = useState(NAV_ITEMS[0].key);

  return (
    <View
      style={{
        flexDirection: "row",
        alignSelf: "center",
        borderRadius: 100,
        borderWidth: 1,
        borderColor: "#2A3A2A",
        padding: 6,
        gap: 6,
      }}
    >
      {NAV_ITEMS.map((item) => {
        const isActive = item.key === activeKey;
        const Icon = item.icon;

        return (
          <Pressable
            key={item.key}
            onPress={() => {
              setActiveKey(item.key);
              item.onPress?.();
            }}
            style={({ pressed }) => [
              {
                width: 52,
                height: 52,
                borderRadius: 26,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: isActive ? ACTIVE_BG : INACTIVE_BG,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            android_ripple={{ color: "#00000022", borderless: true }}
          >
            {/* If your SVG icons support a `color` prop (currentColor-based fill),
                this swaps their tint based on active state. If your icons are
                already colored/flat, just remove the `color` prop below. */}
            <Icon
              color={isActive ? ACTIVE_ICON_COLOR : INACTIVE_ICON_COLOR}
              width={22}
              height={22}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
