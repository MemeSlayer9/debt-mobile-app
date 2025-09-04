import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Dropdown } from "react-native-element-dropdown";
import { useCurrency } from "../context/CurrencyContext";
import { supabase } from "../supabase/supabaseClient";

interface Currency {
  name: string;
  symbol: string;
  flag: string;
}

// Static currency list with flags
const currencies: Currency[] = [
  { name: "United States Dollar", symbol: "$", flag: "🇺🇸" },
  { name: "Euro", symbol: "€", flag: "🇪🇺" },
  { name: "British Pound Sterling", symbol: "£", flag: "🇬🇧" },
  { name: "Japanese Yen", symbol: "¥", flag: "🇯🇵" },
  { name: "Australian Dollar", symbol: "$", flag: "🇦🇺" },
  { name: "Canadian Dollar", symbol: "$", flag: "🇨🇦" },
  { name: "Swiss Franc", symbol: "CHF", flag: "🇨🇭" },
  { name: "Chinese Yuan", symbol: "¥", flag: "🇨🇳" },
  { name: "Indian Rupee", symbol: "₹", flag: "🇮🇳" },
  { name: "Russian Ruble", symbol: "₽", flag: "🇷🇺" },
  { name: "Brazilian Real", symbol: "R$", flag: "🇧🇷" },
  { name: "South African Rand", symbol: "R", flag: "🇿🇦" },
  { name: "Mexican Peso", symbol: "$", flag: "🇲🇽" },
  { name: "Singapore Dollar", symbol: "$", flag: "🇸🇬" },
  { name: "New Zealand Dollar", symbol: "$", flag: "🇳🇿" },
  { name: "Hong Kong Dollar", symbol: "HK$", flag: "🇭🇰" },
  { name: "Philippine Peso", symbol: "₱", flag: "🇵🇭" },
  { name: "Thai Baht", symbol: "฿", flag: "🇹🇭" },
  { name: "South Korean Won", symbol: "₩", flag: "🇰🇷" },
  { name: "Turkish Lira", symbol: "₺", flag: "🇹🇷" },
  { name: "Emirati Dirham", symbol: "₻", flag: "🇦🇪" },
  { name: "Argentinian Peso", symbol: "$", flag: "🇦🇷" },
  { name: "Chilean Peso", symbol: "$", flag: "🇨🇱" },
  { name: "Colombian Peso", symbol: "$", flag: "🇨🇴" },
  { name: "Czech Koruna", symbol: "Kč", flag: "🇨🇿" },
  { name: "Danish Krone", symbol: "kr", flag: "🇩🇰" },
  { name: "Egyptian Pound", symbol: "E£", flag: "🇪🇬" },
  { name: "Hungarian Forint", symbol: "Ft", flag: "🇭🇺" },
  { name: "Indonesian Rupiah", symbol: "Rp", flag: "🇮🇩" },
  { name: "Israeli Shekel", symbol: "₪", flag: "🇮🇱" },
  { name: "Kazakhstani Tenge", symbol: "₸", flag: "🇰🇿" },
  { name: "Malaysian Ringgit", symbol: "RM", flag: "🇲🇾" },
  { name: "Moroccan Dirham", symbol: "د.م", flag: "🇲🇦" },
  { name: "Norwegian Krone", symbol: "kr", flag: "🇳🇴" },
  { name: "Peruvian Sol", symbol: "S/.", flag: "🇵🇪" },
  { name: "Polish Zloty", symbol: "zł", flag: "🇵🇱" },
  { name: "Romanian Leu", symbol: "₯", flag: "🇷🇴" },
  { name: "Saudi Riyal", symbol: "﷼", flag: "🇸🇦" },
  { name: "Swedish Krona", symbol: "kr", flag: "🇸🇪" },
  { name: "Ukrainian Hryvnia", symbol: "₴", flag: "🇺🇦" },
  { name: "Vietnamese Dong", symbol: "₫", flag: "🇻🇳" },
];

const SettingsScreen: React.FC = () => {
  const { setCurrency } = useCurrency();

  // Convert the static currency list into dropdown-friendly data
  const dropdownData = currencies.map((currency) => ({
    label: `${currency.flag} ${currency.name} (${currency.symbol})`,
    value: currency.name,
  }));

  const [currencyValue, setCurrencyValue] = useState<string>(dropdownData[0].value);
  const onCurrencyChange = (item: { value: string }) => {
    setCurrencyValue(item.value);
    const selected = currencies.find((cur) => cur.name === item.value);
    if (selected) {
      setCurrency(selected.symbol);
    }
  };

  // -------------------------------
  // Backup & Restore for Customers
  // -------------------------------
  const [userId, setUserId] = useState<string | null>(null);

  // Fetch authenticated user session to get userId
  useEffect(() => {
    const fetchUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUserId(session?.user?.id || null);
    };
    fetchUser();
  }, []);

  // Backup customers from Supabase to AsyncStorage
  const backupCustomers = async () => {
    if (!userId) {
      Alert.alert("Error", "User not authenticated");
      return;
    }
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("user_id", userId);
    if (error) {
      Alert.alert("Error", "Failed to fetch customers for backup");
      return;
    }
    try {
      await AsyncStorage.setItem("@customersBackup", JSON.stringify(data));
      Alert.alert("Backup Created", "Customer backup created successfully");
    } catch (err: any) {
      Alert.alert("Error", err.message);
    }
  };

  // Restore customers backup by inserting them back into Supabase
  const restoreCustomersBackup = async () => {
    if (!userId) {
      Alert.alert("Error", "User not authenticated");
      return;
    }
    try {
      const backupData = await AsyncStorage.getItem("@customersBackup");
      if (backupData) {
        const customersBackup = JSON.parse(backupData);
        for (const customer of customersBackup) {
          // Remove local-only fields (like id) that may conflict with database primary keys
          const { id, ...customerData } = customer;
          const { error } = await supabase.from("customers").insert({
            ...customerData,
            user_id: userId, // Ensure restored data is tied to current user
          });
          if (error) {
            console.error("Error restoring customer:", error);
          }
        }
        Alert.alert("Restore Completed", "Customers restored from backup");
      } else {
        Alert.alert("No Backup Found", "No customer backup was found");
      }
    } catch (err: any) {
      Alert.alert("Restore Error", err.message);
    }
  };

  // -------------------------------
  // UI for Settings Screen
  // -------------------------------
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
        {/* Screen Title */}
        <Text style={styles.screenTitle}>Settings</Text>

        {/* Configuration Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Configuration</Text>
          <View style={styles.listItem}>
            <Dropdown
              style={styles.dropdown}
              placeholderStyle={styles.placeholderStyle}
              selectedTextStyle={styles.selectedTextStyle}
              data={dropdownData}
              labelField="label"
              valueField="value"
              placeholder="Select currency"
              value={currencyValue}
              onChange={onCurrencyChange}
            />
          </View>
        </View>

        {/* Appearance Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Appearance</Text>
          <TouchableOpacity style={styles.listItem}>
            <View style={styles.listItemContent}>
              <Text style={styles.itemTitle}>Language</Text>
              <Text style={styles.itemSubtitle}>Use system configuration</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.listItem}>
            <View style={styles.listItemContent}>
              <Text style={styles.itemTitle}>App theme</Text>
              <Text style={styles.itemSubtitle}>The app will use the same theme as the system</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.listItem}>
            <View style={styles.listItemContent}>
              <Text style={styles.itemTitle}>Main color</Text>
              <Text style={styles.itemSubtitle}>Customize the main color</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Backup & Restore Section for Customers */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Backup & Restore</Text>
          <TouchableOpacity style={styles.listItem} onPress={backupCustomers}>
            <View style={styles.listItemContent}>
              <Text style={styles.itemTitle}>Backup Customers</Text>
              <Text style={styles.itemSubtitle}>Backup customer data from the server</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.listItem} onPress={restoreCustomersBackup}>
            <View style={styles.listItemContent}>
              <Text style={styles.itemTitle}>Restore Customers Backup</Text>
              <Text style={styles.itemSubtitle}>Restore customer data to the server</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0E1114",
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  listItem: {
    backgroundColor: "#1E1E1E",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  listItemContent: {
    flexDirection: "column",
  },
  itemTitle: {
    fontSize: 14,
    color: "#FFFFFF",
    marginBottom: 2,
  },
  itemSubtitle: {
    fontSize: 12,
    color: "#999999",
  },
  dropdown: {
    backgroundColor: "#1E1E1E",
    borderColor: "#2C2C2C",
    height: 40,
  },
  placeholderStyle: {
    color: "#FFFFFF",
    fontSize: 14,
  },
  selectedTextStyle: {
    color: "#FFFFFF",
    fontSize: 14,
  },
});

export default SettingsScreen;
