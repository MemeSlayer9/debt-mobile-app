import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
} from "react-native";
import { Provider as PaperProvider } from "react-native-paper";
import { DatePickerModal } from "react-native-paper-dates";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { supabase } from "../supabase/supabaseClient";
import { useUser } from "../context/UserContext";

// Custom type for the beforeRemove event
type BeforeRemoveEvent = {
  data: { action: any };
  preventDefault: () => void;
};

type Customer = {
  id: number;
  checked: boolean;
  name: string;
  email: string;
  phone: string;
  balance: number;
  date: string;
  user_id: string;
};

export default function InvoiceMobileUI() {
  const navigation = useNavigation<any>();
  const { logout } = useUser();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedFilter, setSelectedFilter] = useState("All");
  const [searchText, setSearchText] = useState("");
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Get current user session
  useEffect(() => {
    const fetchUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUserId(session?.user?.id || null);
    };
    fetchUser();
  }, []);

  // Load user-specific customers
  const loadCustomers = async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("user_id", userId);

    if (error) {
      console.error("Error fetching customers:", error);
    } else if (data) {
      const customersWithChecked = data.map((customer: any) => ({
        ...customer,
        checked: false,
        balance: customer.balance || 0,
      }));
      setCustomers(customersWithChecked);
    }
  };

  // Refresh data when screen is focused
  useFocusEffect(
    React.useCallback(() => {
      loadCustomers();
    }, [userId])
  );

  // Realtime subscription for user-specific changes
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("realtime-customers")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "customers",
          filter: `user_id=eq.${userId}`,
        },
        () => loadCustomers()
      )
      .subscribe((status: any) => {
        console.log("Realtime channel status:", status);
      });
    return () => {
      console.log("Unsubscribing from realtime channel");
      channel.unsubscribe();
    };
  }, [userId]);

  // Intercept the back navigation to trigger logout confirmation
  useEffect(() => {
    const unsubscribe = navigation.addListener(
      "beforeRemove",
      (e: BeforeRemoveEvent) => {
        // Prevent default behavior of leaving the screen
        e.preventDefault();
        Alert.alert("Confirm Logout", "Are you sure you want to log out?", [
          { text: "Cancel", style: "cancel", onPress: () => {} },
          {
            text: "Logout",
            style: "destructive",
            onPress: () => {
              logout();
              // Continue with the navigation action
              navigation.dispatch(e.data.action);
            },
          },
        ]);
      }
    );
    return unsubscribe;
  }, [navigation, logout]);

  const toggleCheckbox = (id: number) => {
    setCustomers((prev) =>
      prev.map((customer) =>
        customer.id === id ? { ...customer, checked: !customer.checked } : customer
      )
    );
  };

  const isSameDay = (d1: Date, d2: Date) =>
    d1.getDate() === d2.getDate() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getFullYear() === d2.getFullYear();

  const filteredCustomers = customers.filter((customer: Customer) => {
    const matchesSearch =
      searchText === "" ||
      customer.name.toLowerCase().includes(searchText.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchText.toLowerCase()) ||
      customer.phone.includes(searchText);

    const matchesDate = selectedDate
      ? isSameDay(new Date(customer.date), selectedDate)
      : true;

    switch (selectedFilter) {
      case "Unpaid":
        return customer.balance > 0 && matchesSearch && matchesDate;
      case "Paid":
        return customer.balance <= 0 && matchesSearch && matchesDate;
      default:
        return matchesSearch && matchesDate;
    }
  });

  // Sort so that newest (most recent date) appears first
  const sortedCustomers = [...filteredCustomers].sort(
    (a: Customer, b: Customer) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const totalBalance = sortedCustomers.reduce(
    (acc: number, customer: Customer) => acc + customer.balance,
    0
  );

  return (
    <PaperProvider>
      <View style={styles.container}>
        {/* Header - back navigation (handled by hardware/back button) */}
        <View style={styles.header}>
          <Text style={styles.headerText}>
            {new Date().toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </Text>
        </View>
        <ScrollView contentContainerStyle={styles.contentContainer}>
          <View style={styles.dateSelectorContainer}>
            <TouchableOpacity onPress={() => setOpen(true)} style={styles.dateButton}>
              <Text style={styles.dateButtonText}>
                {selectedDate ? selectedDate.toLocaleDateString() : "Select Date"}
              </Text>
            </TouchableOpacity>
            {selectedDate && (
              <TouchableOpacity onPress={() => setSelectedDate(null)} style={styles.clearButton}>
                <Text style={styles.clearButtonText}>All Dates</Text>
              </TouchableOpacity>
            )}
            <DatePickerModal
              mode="single"
              visible={open}
              onDismiss={() => setOpen(false)}
              date={selectedDate || new Date()}
              locale="en"
              onConfirm={({ date }) => {
                setOpen(false);
                if (date instanceof Date) {
                  setSelectedDate(date);
                }
              }}
            />
          </View>
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search customers..."
              placeholderTextColor="#666"
              value={searchText}
              onChangeText={setSearchText}
            />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterContainer}
          >
            {["All", "Unpaid", "Paid"].map((filter) => (
              <TouchableOpacity
                key={filter}
                style={[styles.filterPill, selectedFilter === filter && styles.selectedFilter]}
                onPress={() => setSelectedFilter(filter)}
              >
                <Text
                  style={[styles.filterText, selectedFilter === filter && styles.selectedFilterText]}
                >
                  {filter}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={styles.invoiceList}>
            {sortedCustomers.map((customer) => (
              <TouchableOpacity
                key={customer.id}
                style={styles.card}
                onPress={() => navigation.navigate("CustomerDetails", { customer })}
              >
                <View style={styles.cardHeader}>
                  <TouchableOpacity
                    style={styles.checkbox}
                    onPress={() => toggleCheckbox(customer.id)}
                  >
                    <Text>{customer.checked ? "✓" : "○"}</Text>
                  </TouchableOpacity>
                  <Text style={styles.invoiceNumber}>{customer.name}</Text>
                  <View
                    style={[styles.status, customer.balance > 0 ? styles.unpaid : styles.paid]}
                  >
                    <Text style={styles.statusText}>
                      {customer.balance > 0 ? "Unpaid" : "Paid"}
                    </Text>
                  </View>
                </View>
                <View style={styles.divider} />
                <Text style={styles.cardText}>Email: {customer.email}</Text>
                <Text style={styles.cardText}>Phone: {customer.phone}</Text>
                <Text style={styles.cardText}>
                  Date Added: {new Date(customer.date).toLocaleDateString()}
                </Text>
                <Text style={styles.amountText}>
                Balance: ₱{customer.balance.toFixed(2)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        {/* Absolute positioned bottom container */}
        <View style={styles.bottomContainer}>
          <View style={styles.bottomLeft}>
            <Text style={styles.totalText}>
              Total Balance: ${totalBalance.toFixed(2)}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.addCustomerButton}
            onPress={() => navigation.navigate("AddCustomer")}
          >
            <Text style={styles.addCustomerButtonText}>+ Add Customer</Text>
          </TouchableOpacity>
        </View>
      </View>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  contentContainer: { paddingBottom: 140 },
  header: {
    padding: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    alignItems: "center",
  },
  headerText: { fontSize: 18, fontWeight: "bold", color: "#2c3e50" },
  dateSelectorContainer: { padding: 16, alignItems: "center" },
  dateButton: {
    backgroundColor: "#3498db",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginVertical: 8,
    alignItems: "center",
  },
  dateButtonText: { color: "white", fontWeight: "bold" },
  clearButton: {
    backgroundColor: "#e74c3c",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginVertical: 4,
    alignItems: "center",
  },
  clearButtonText: { color: "white", fontWeight: "bold" },
  searchContainer: { paddingHorizontal: 16, marginBottom: 12 },
  searchInput: { backgroundColor: "white", borderRadius: 8, padding: 12, fontSize: 16 },
  filterContainer: { paddingHorizontal: 16, marginBottom: 12 },
  filterPill: {
    backgroundColor: "#ecf0f1",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginRight: 8,
  },
  selectedFilter: { backgroundColor: "#3498db" },
  filterText: { color: "#7f8c8d" },
  selectedFilterText: { color: "white" },
  invoiceList: { paddingHorizontal: 16, marginBottom: 16 },
  card: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  checkbox: { marginRight: 12 },
  invoiceNumber: { flex: 1, fontWeight: "bold", fontSize: 16, color: "#2c3e50" },
  status: { borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8 },
  paid: { backgroundColor: "#e8f6ef" },
  unpaid: { backgroundColor: "#fdedec" },
  statusText: { fontWeight: "bold", fontSize: 12 },
  divider: { height: 1, backgroundColor: "#eee", marginVertical: 12 },
  cardText: { fontSize: 14, color: "#34495e", marginBottom: 6 },
  amountText: { fontSize: 16, fontWeight: "bold", color: "#2980b9" },
  bottomContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  bottomLeft: { flexDirection: "column" },
  totalText: { fontSize: 18, fontWeight: "bold", color: "#2980b9" },
  addCustomerButton: {
    backgroundColor: "#3498db",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 28,
  },
  addCustomerButtonText: { color: "white", fontSize: 16, fontWeight: "bold" },
});
