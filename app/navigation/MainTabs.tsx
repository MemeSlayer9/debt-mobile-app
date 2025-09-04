// TabNavigator.tsx
import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { View, Text, Image, StyleSheet } from "react-native";
import Icon from "react-native-vector-icons/Ionicons";

import Account from "../MyAccount/Account";
import Customers from "../screen/Customers";
import CustomersTransactions from "../screen/CustomersTransactions";

import { useUser } from "../context/UserContext";
import HomeScreen from "../screen/HomeScreen";

const Tab = createBottomTabNavigator();

// Inline component to display profile image and username for Account tab
const InlineAccountTabIcon = () => {
  const { user } = useUser();

  if (!user) {
    // Fallback if no user data is available
    return <Text style={styles.fallbackText}>Account</Text>;
  }

  return (
    <View style={styles.iconContainer}>
      <Image 
        source={{ uri: user.profileImage }}
        style={styles.iconImage}
      />
      <Text style={styles.iconText}>{user.username}</Text>
    </View>
  );
};

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { 
          backgroundColor: "#0E1114",
          borderTopWidth: 0, // Removes the top border line
          elevation: 0, // Removes shadow on Android
        },
        tabBarActiveTintColor: "#006A6A", // Customize active tint color if needed
        tabBarInactiveTintColor: "#FFFFFF", // Customize inactive tint color if needed
      }}
    >
      <Tab.Screen 
        name="Customers" 
        component={Customers}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Icon name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen 
        name="Transactions" 
        component={CustomersTransactions}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Icon name="book-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen 
        name="Account" 
        component={Account}
        options={{
          tabBarIcon: () => <InlineAccountTabIcon />,
          tabBarLabel: () => null, // Hides label only for this tab
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  iconImage: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  iconText: {
    fontSize: 10,
    marginTop: 2,
    color: "#FFFFFF",
  },
  fallbackText: {
    fontSize: 12,
    color: "#FFFFFF",
  },
});
