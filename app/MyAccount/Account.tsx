import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Alert,
  ScrollView,
} from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Dropdown } from "react-native-element-dropdown"; // Adjust this import as needed
import { DatePickerModal } from "react-native-paper-dates";
import { supabase } from "../supabase/supabaseClient";
import { RootStackParamList } from "../navigation/navigationTypes";
import { useUser } from "../context/UserContext";
import { Ionicons } from '@expo/vector-icons';
import { useCurrency } from "../context/CurrencyContext"; 
import NetInfo from "@react-native-community/netinfo";

// Define our filter type.
type FilterType = {
  label: string;
  value: string;
};

// CustomRange with nullable Dates.
type CustomRange = {
  startDate: Date | null;
  endDate: Date | null;
};

// Dropdown options.
const filters: FilterType[] = [
  { label: "Today", value: "today" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
  { label: "This Year", value: "year" },
  { label: "Custom Date", value: "custom" },
  { label: "All Transactions", value: "all" },
];

// Function to compute date ranges.
const getDateRange = (filter: string, customRange: CustomRange) => {
  const now = new Date();
  let startDate: Date | null = null;
  let endDate: Date | null = null;
  switch (filter) {
    case "today":
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      break;
    case "week": {
      const firstDayOfWeek = now.getDate() - now.getDay();
      startDate = new Date(now.getFullYear(), now.getMonth(), firstDayOfWeek);
      endDate = new Date(now.getFullYear(), now.getMonth(), firstDayOfWeek + 7);
      break;
    }
    case "month":
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      break;
    case "year":
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate = new Date(now.getFullYear() + 1, 0, 1);
      break;
    case "custom":
      startDate = customRange.startDate;
      endDate = customRange.endDate;
      break;
    default:
      break;
  }
  return { startDate, endDate };
};

// Define Customer type.
interface Customer {
  id: number;
  name: string;
  email: string;
  phone: string;
  balance: number;
  user_id: string;
}

// Define CustomerTransactionSummary type.
interface CustomerTransactionSummary {
  customer_id: number | null;
  all_total_transactions: number;
  all_total_amount: number;
  today_total_transactions: number;
  today_total_amount: number;
  week_total_transactions: number;
  week_total_amount: number;
  month_total_transactions: number;
  month_total_amount: number;
  year_total_transactions: number;
  year_total_amount: number;
  transaction_date?: string;
}
interface CachedDataType {
  customers: Customer[];
  summaries: CustomerTransactionSummary[];
}

const AccountScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, "Account">>();
  const { user } = useUser();
  const { currency } = useCurrency(); // Get the selected currency from context

  const [userId, setUserId] = useState<string | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [transactionSummaries, setTransactionSummaries] = useState<CustomerTransactionSummary[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<string>("today");
  const [customRange, setCustomRange] = useState<CustomRange>({ startDate: null, endDate: null });
  const [showCustomPicker, setShowCustomPicker] = useState<boolean>(false);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [cachedData, setCachedData] = useState<CachedDataType>({
    customers: [],
    summaries: []
  });

  // Check network connectivity
  useEffect(() => {
    NetInfo.fetch().then(state => {
      setIsOffline(!state.isConnected);
    });
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOffline(!state.isConnected);
      if (state.isConnected && !isLoading) {
        fetchData();
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const id = session?.user?.id || null;
      setUserId(id);
      const image = session?.user?.user_metadata?.avatar_url || null;
      setProfileImage(image);

      if (id) {
        const { data: customersData, error: customersError } = await supabase
          .from("customers")
          .select("*")
          .eq("user_id", id);
        if (customersError) throw new Error("Failed to fetch customers: " + customersError.message);
        setCustomers(customersData || []);
        if (customersData) setCachedData(prev => ({ ...prev, customers: customersData }));

        const { data: summariesData, error: summariesError } = await supabase
          .from("customer_transaction_summary")
          .select("*");
        if (summariesError) throw new Error("Failed to fetch transaction summaries: " + summariesError.message);
        setTransactionSummaries(summariesData || []);
        if (summariesData) setCachedData(prev => ({ ...prev, summaries: summariesData }));
      }
    } catch (error: any) {
      if (!isOffline) Alert.alert("Error", error.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOffline && cachedData) {
      setCustomers(cachedData.customers || []);
      setTransactionSummaries(cachedData.summaries || []);
    }
  }, [isOffline, cachedData]);

  useFocusEffect(
    useCallback(() => {
      if (!isOffline) fetchData();
    }, [isOffline])
  );

  const handleLogout = () => {
    Alert.alert(
      "Confirm Logout",
      "Are you sure you want to log out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Logout",
          onPress: async () => {
            try {
              const { error } = await supabase.auth.signOut();
              if (error) throw error;
              navigation.replace("Login");
            } catch (error: any) {
              Alert.alert("Logout Error", error.message);
            }
          },
          style: "destructive",
        },
      ],
      { cancelable: true }
    );
  };

  const handleFilterPress = (filterValue: string) => {
    if (filterValue === "custom") setShowCustomPicker(true);
    else setSelectedFilter(filterValue);
  };

  return (
    <ScrollView style={styles.container}>
      {isOffline && (
        <TouchableOpacity style={styles.offlineBanner} onPress={() => NetInfo.fetch().then(s => !s.isConnected ? Alert.alert("Still Offline", "Please check your internet connection and try again.") : fetchData())}>
          <Ionicons name="cloud-offline" size={20} color="white" />
          <Text style={styles.offlineText}>You're offline. Tap to retry.</Text>
        </TouchableOpacity>
      )}

      <View style={styles.headerContainer}>
        {(user?.profileImage || profileImage) && (
          <Image source={{ uri: user?.profileImage || profileImage! }} style={styles.profileImage} resizeMode="cover" />
        )}
        <View style={styles.userInfo}>
          <Text style={styles.welcomeText}>Welcome, {user?.username || "Guest"}!</Text>
        </View>
      </View>

      <View style={styles.menuContainer}>
        <Dropdown
          style={styles.dropdown}
          containerStyle={styles.dropdownContainer}
          placeholderStyle={styles.placeholderStyle}
          selectedTextStyle={styles.selectedTextStyle}
          iconStyle={styles.iconStyle}
          data={filters}
          labelField="label"
          valueField="value"
          value={selectedFilter}
          placeholder="Select Filter"
          onChange={(item: FilterType) => handleFilterPress(item.value)}
          renderItem={(item: FilterType) => (
            <View style={styles.itemContainer}>
              <Text style={styles.itemText}>{item.label}</Text>
            </View>
          )}
          renderRightIcon={() => (
            <Ionicons name="chevron-down-outline" size={20} color="#999" style={styles.iconStyle} />
          )}
          disable={isOffline && !cachedData}
        />

        <DatePickerModal
          mode="range"
          visible={showCustomPicker}
          onDismiss={() => setShowCustomPicker(false)}
          onConfirm={({ startDate, endDate }) => {
            setShowCustomPicker(false);
            setCustomRange({
              startDate: startDate ? new Date(startDate.toISOString()) : null,
              endDate: endDate ? new Date(endDate.toISOString()) : null,
            });
            setSelectedFilter("custom");
          }}
          startDate={customRange.startDate ?? new Date()}
          endDate={customRange.endDate ?? new Date()}
          saveLabel="Save"
          label="Select a date range"
          locale="en"
        />

        <TouchableOpacity style={styles.menuItem} onPress={() => {
          if (isOffline && !cachedData) {
            Alert.alert("Offline", "This feature is not available in offline mode without cached data.");
            return;
          }
          navigation.navigate("EditProfile");
        }}>
          <Text style={styles.menuText}>Edit Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={() => {
          if (isOffline) {
            Alert.alert("Offline", "This feature is not available in offline mode.");
            return;
          }
          navigation.navigate("ChangePassword");
        }}>
          <Text style={styles.menuText}>Change Password</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={() => {
          if (isOffline && !cachedData) {
            Alert.alert("Offline", "This feature is not available in offline mode without cached data.");
            return;
          }
          navigation.navigate("Customers");
        }}>
          <Text style={styles.menuText}>Customers</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate("Settings")}>
          <Text style={styles.menuText}>Settings</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={handleLogout} disabled={isOffline}>
          <Text style={[styles.logoutButtonText, isOffline && styles.disabledText]}>Log Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};
const styles = StyleSheet.create({
  // Main container with dark theme
  container: { 
    flex: 1, 
    backgroundColor: "#121212", 
    padding: 20 
  },
  
  // Header section
  headerContainer: { 
    flexDirection: "row", 
    alignItems: "center", 
    paddingHorizontal: 20, 
    marginBottom: 20 
  },
  userInfo: { 
    flex: 1 
  },
  profileImage: { 
    width: 80, 
    height: 80, 
    borderRadius: 40, 
    marginRight: 15, 
    borderWidth: 2,
    borderColor: "#006A6A" 
  },
  welcomeText: { 
    fontSize: 24, 
    fontWeight: "bold", 
    marginBottom: 20, 
    color: "#FFFFFF" // Changed to white for better visibility on dark background
  },
  
  // Menu section
  menuContainer: { 
    marginHorizontal: 20 
  },
  menuItem: { 
    paddingVertical: 15, 
    borderBottomWidth: 1, 
    borderBottomColor: "#333333" // Darker border for dark theme
  },
  menuText: { 
    fontSize: 16, 
    color: "#E0E0E0" // Lighter text for dark theme
  },
  logoutButtonText: { 
    color: "#006A6A", 
    fontSize: 16, 
    fontWeight: "600" 
  },
  
  // Dropdown styling
  dropdown: { 
    height: 50, 
    borderColor: "#333333", 
    borderWidth: 1, 
    borderRadius: 8, 
    paddingHorizontal: 8, 
    backgroundColor: "#1E1E1E", // Darker background for dropdown
    justifyContent: "center", 
    marginBottom: 20 
  },
  dropdownContainer: { 
    borderColor: "#333333", 
    borderWidth: 1, 
    borderRadius: 8, 
    marginTop: 5,
    backgroundColor: "#1E1E1E" // Darker background for dropdown container
  },
  iconStyle: { 
    width: 20, 
    height: 20, 
    tintColor: "#CCCCCC" // Lighter icon color for dark theme
  },
  placeholderStyle: { 
    fontSize: 16, 
    color: "#999999" 
  },
  selectedTextStyle: { 
    fontSize: 16, 
    color: "#FFFFFF" // White text for better visibility
  },
  
  // Dropdown item styles
  itemContainer: {
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  itemText: {
    fontSize: 16,
    color: "#E0E0E0" // Lighter text for dark theme
  },
  
  // Offline banner styles
  offlineBanner: { 
    backgroundColor: "#E74C3C", 
    padding: 10, 
    flexDirection: "row", 
    justifyContent: "center", 
    alignItems: "center", 
    marginBottom: 10, 
    borderRadius: 5 
  },
  offlineText: { 
    color: "white", 
    marginLeft: 10, 
    fontWeight: "bold" 
  },
  disabledText: { 
    color: "#666666" // Darker disabled text that's still visible
  },
});


export default AccountScreen;
